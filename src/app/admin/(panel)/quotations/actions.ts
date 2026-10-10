"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cols, db, exec, maybe, one, schema, tbl, type Row } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { ensureCustomerForLead } from "@/server/crm";
import { sendEmail } from "@/server/email";
import { notify } from "@/server/notifications";
import { npr } from "@/lib/format";
import { PAYMENT_METHODS, recordPayment } from "@/server/finance";
import { bookingFromQuotation, duplicateQuotation, markSent, newToken, saveQuotation, setBookingStatus } from "@/server/sales";

const item = z.object({
  description: zs.required("Description", 300),
  details: zs.optional(1000),
  quantity: z.coerce.number().positive("Quantity must be more than 0.").max(100000),
  unit: zs.optional(30),
  unitPrice: zs.money(),
  inventoryItemId: zs.optUuid(),
});

const fields = z.object({
  id: zs.optUuid(),
  customerId: zs.optUuid(),
  leadId: zs.optUuid(),
  inquiryId: zs.optUuid(),
  packageId: zs.optUuid(),
  couponCode: zs.optional(40),
  title: zs.required("Title", 200),
  eventType: zs.optional(60),
  eventDate: zs.date(),
  venue: zs.optional(200),
  guestCount: z
    .union([z.coerce.number().int().min(0).max(100000), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  validUntil: zs.date(),
  discountType: z.enum(["PERCENT", "FIXED"]).default("FIXED"),
  discountValue: z.coerce.number().min(0).max(1_000_000_000).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  depositPercent: z.coerce.number().min(0).max(100).default(50),
  notes: zs.optional(4000),
  terms: zs.optional(8000),
  termsVersion: zs.optional(40),
  items: z.array(item).min(1, "Add at least one line item.").max(200),
});

const quotes = () => db.from(tbl(schema.quotations));

export const saveQuote = adminAction(["quotations.create", "quotations.update"], fields, async ({ id, ...input }, user) => {
  if (id ? !user.permissions.has("quotations.update") : !user.permissions.has("quotations.create")) throw new UserError("You don't have permission to do that.");
  let customerId = input.customerId;
  if (!customerId && input.leadId) customerId = await ensureCustomerForLead(db, input.leadId, user);
  if (!customerId) throw new UserError("Choose the customer this quotation is for.", { customerId: "Required." });
  if (input.validUntil && input.eventDate && input.validUntil > input.eventDate) {
    throw new UserError("The quote should expire before the event date.", { validUntil: "After the event date." });
  }
  const quoteId = await saveQuotation(db, { ...input, customerId }, user, id ?? undefined);
  const q = await one<{ number: string }>(quotes().select("number").eq("id", quoteId));
  await audit(user, id ? "update" : "create", "quotation", quoteId, `${id ? "Updated" : "Created"} quotation ${q.number}`);
  return { id: quoteId };
});

export const sendQuote = adminAction("quotations.update", z.object({ id: zs.uuid(), email: z.boolean().default(true) }), async ({ id, email }, user) => {
  const quote = await markSent(db, id, user);
  const fresh = await one<Row<typeof schema.quotations> & { c: { name: string; email: string | null } }>(
    quotes().select(`${cols(schema.quotations)},c:customers!inner(name,email)`).eq("id", id),
  );
  let emailed = "NO_RECIPIENT";
  if (email)
    emailed = await sendEmail(
      fresh.c.email,
      "quotationSent",
      { name: fresh.c.name, number: fresh.number, title: fresh.title, total: fresh.total, validUntil: fresh.validUntil, token: fresh.publicToken },
      { entityType: "quotation", entityId: id },
    );
  await audit(user, "send", "quotation", id, `Sent quotation ${quote.number}`, { email: emailed });
  return { token: fresh.publicToken, emailed };
});

/** New private token: the old client link stops working (e.g. it was forwarded to the wrong person). */
export const resetQuoteLink = adminAction("quotations.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const q = await maybe<{ number: string }>(quotes().update({ public_token: newToken() }).eq("id", id).is("deleted_at", null).select("number"));
  if (!q) throw new UserError("Quotation not found.");
  await audit(user, "reset-link", "quotation", id, `Reset the client link for ${q.number}`);
});

export const duplicateQuote =adminAction("quotations.create", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const newId = await duplicateQuotation(db, id, user);
  await audit(user, "duplicate", "quotation", newId, "Duplicated a quotation");
  redirect(`/admin/quotations/${newId}/edit`);
});

export const convertQuote = adminAction("quotations.approve", z.object({ id: zs.uuid(), confirm: z.boolean().default(false) }), async ({ id, confirm }, user) => {
  const result = await bookingFromQuotation(db, id, user, confirm ? "CONFIRMED" : "PENDING");
  if (!result.existed) {
    const b = await one<{ number: string }>(db.from(tbl(schema.bookings)).select("number").eq("id", result.booking.id));
    await audit(user, "convert", "quotation", id, `Converted quotation to booking ${b.number}`, { bookingId: result.booking.id });
    if (result.shortages)
      await notify({
        type: "inventory.shortage",
        title: `Inventory shortage for ${b.number}`,
        body: result.shortages,
        href: `/admin/bookings/${result.booking.id}`,
        priority: "URGENT",
        permission: "inventory.view",
      });
  }
  return { bookingId: result.booking.id, shortages: result.shortages, existed: result.existed };
});

/**
 * The client paid the advance: book the quotation (if it isn't already) and record the payment.
 * The booking is confirmed when the advance covers the required amount, or when staff tick "confirm".
 */
export const recordAdvance = adminAction(
  "payments.create",
  z.object({
    id: zs.uuid(),
    amount: zs.money(),
    method: z.enum(PAYMENT_METHODS),
    paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date received."),
    reference: zs.optional(120),
    notes: zs.optional(1000),
    confirm: z.boolean().default(true),
  }),
  async ({ id, confirm, ...payment }, user) => {
    if (payment.amount <= 0) throw new UserError("Enter the advance amount.", { amount: "Must be more than 0." });
    const existing = await maybe<{ id: string }>(db.from(tbl(schema.bookings)).select("id").eq("quotation_id", id).limit(1));
    if (!existing && !user.permissions.has("quotations.approve")) throw new UserError("You don't have permission to turn quotations into bookings.");
    const q = await one<{ number: string }>(quotes().select("number").eq("id", id));

    const booked = await bookingFromQuotation(db, id, user, "PENDING");
    if (!booked.existed) await audit(user, "convert", "quotation", id, `Booked ${q.number} on receiving the advance`, { bookingId: booked.booking.id });
    const r = await recordPayment(db, { bookingId: booked.booking.id, ...payment, notes: payment.notes ?? `Advance for ${q.number}` }, user);
    let confirmed = r.autoConfirmed || r.booking.status === "CONFIRMED";
    if (confirm && !confirmed && r.booking.status === "PENDING") {
      await setBookingStatus(db, r.booking.id, "CONFIRMED", user);
      confirmed = true;
    }
    await audit(user, "create", "payment", r.payment.id, `Recorded advance ${npr(payment.amount)} (${r.payment.number}) on ${r.booking.number}`);
    await notify({
      type: "payment.received",
      title: `Advance received: ${npr(payment.amount)}`,
      body: `${r.booking.number} · ${q.number}${confirmed ? " · booking confirmed" : ""}`,
      href: `/admin/bookings/${r.booking.id}?tab=payments`,
      entityType: "payment",
      entityId: r.payment.id,
      permission: "payments.view",
    });
    if (booked.shortages)
      await notify({ type: "inventory.shortage", title: `Inventory shortage for ${r.booking.number}`, body: booked.shortages, href: `/admin/bookings/${r.booking.id}`, priority: "URGENT", permission: "inventory.view" });
    return { bookingId: r.booking.id, bookingNumber: r.booking.number, confirmed, shortages: booked.shortages };
  },
);

export const setQuoteOutcome = adminAction(
  "quotations.update",
  z.object({ id: zs.uuid(), status: z.enum(["REJECTED", "EXPIRED"]), reason: zs.optional(500) }),
  async ({ id, status, reason }, user) => {
    const q = await maybe<{ number: string; status: string }>(quotes().select("number,status").eq("id", id));
    if (!q) throw new UserError("Quotation not found.");
    if (q.status === "ACCEPTED") throw new UserError("An accepted quotation can't be changed.");
    await exec(quotes().update({ status, responded_at: new Date().toISOString(), client_message: reason }).eq("id", id));
    await audit(user, status === "REJECTED" ? "reject" : "expire", "quotation", id, `Marked ${q.number} as ${status.toLowerCase()}`);
  },
);

export const archiveQuote = adminAction("quotations.update", z.object({ id: zs.uuid(), archived: z.boolean() }), async ({ id, archived }, user) => {
  const q = await one<{ number: string }>(quotes().update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).select("number"));
  await audit(user, archived ? "archive" : "restore", "quotation", id, `${archived ? "Archived" : "Restored"} quotation ${q.number}`);
});

/** Drafts that were never sent can be deleted (soft); anything a client has seen is kept. */
export const deleteQuote = adminAction("quotations.delete", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const q = await maybe<{ number: string; sentAt: string | null }>(quotes().select("number,sentAt:sent_at").eq("id", id));
  if (!q) throw new UserError("Quotation not found.");
  if (q.sentAt) throw new UserError("This quotation was sent to the client — archive it instead.");
  await exec(quotes().update({ deleted_at: new Date().toISOString() }).eq("id", id));
  await audit(user, "delete", "quotation", id, `Deleted draft quotation ${q.number}`);
  redirect("/admin/quotations");
});
