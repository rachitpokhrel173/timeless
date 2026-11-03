"use server";

import { z } from "zod";
import { adminDb, db, exec, many, maybe, pgrstValue, schema, tbl } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { ALL_METHODS, FORM_METHODS } from "@/lib/finance";
import { fmtDate, npr, todayISO } from "@/lib/format";
import { likeTerm } from "@/lib/list";
import { sendEmail } from "@/server/email";
import {
  allocatePayment,
  assignPaymentBooking,
  cancelInvoice,
  createInvoice,
  issueInvoice,
  recordPayment,
  refundPayment,
  releaseAllocation,
  reversePayment,
} from "@/server/finance";
import { notify } from "@/server/notifications";
import { payableBookings, type PayableCustomer } from "@/server/payables";

const isoDate = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${label}.`);
const reason = (label = "Reason") => zs.required(label, 500);

/* ───────── Payment form options ───────── */

/** Customers (with their active bookings and open invoices) for the payment form's search. */
export const searchPayables = adminAction("payments.create", z.object({ q: zs.text(80) }), async ({ q }): Promise<PayableCustomer[]> => {
  let query = adminDb.from(tbl(schema.customers)).select("id,name,phone,email").is("deleted_at", null);
  if (q) {
    const term = pgrstValue(likeTerm(q));
    const byBooking = await many<{ customerId: string }>(adminDb.from(tbl(schema.bookings)).select("customerId:customer_id").ilike("number", likeTerm(q)).limit(20));
    const ids = byBooking.map((b) => b.customerId);
    query = query.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}${ids.length ? `,id.in.(${ids.join(",")})` : ""}`);
  } else {
    // No search yet: customers who still owe money, most recent first
    const owing = await many<{ customerId: string }>(adminDb.from("booking_finance").select("customerId:customer_id").gt("outstanding", 0).order("created_at", { ascending: false }).limit(30));
    const ids = [...new Set(owing.map((o) => o.customerId))];
    if (!ids.length) return [];
    query = query.in("id", ids);
  }
  const customers = await many<{ id: string; name: string; phone: string | null; email: string | null }>(query.order("name").limit(25));
  const bookings = await payableBookings(customers.map((c) => c.id));
  return customers.map((c) => ({ ...c, bookings: bookings.get(c.id) ?? [] }));
});

/* ───────── Record a payment (every entry point uses this one action) ───────── */

export const recordPaymentAction = adminAction(
  "payments.create",
  z.object({
    customerId: zs.optUuid(),
    bookingId: zs.optUuid(),
    invoiceId: zs.optUuid(),
    amount: zs.money().refine((n) => n > 0, "Enter an amount above zero."),
    method: z.enum(ALL_METHODS),
    paidAt: isoDate("date received"),
    paymentType: z.enum(["ADVANCE", "PAYMENT"]).default("PAYMENT"),
    reference: zs.optional(120),
    receivedBy: zs.optional(120),
    notes: zs.optional(1000),
    idempotencyKey: zs.uuid(),
    allowOverpayment: z.boolean().default(false),
    sendReceipt: z.boolean().default(false),
  }),
  async ({ sendReceipt, ...input }, user) => {
    if (!input.bookingId && !input.customerId) throw new UserError("Choose the customer and booking this payment is for.", { bookingId: "Required." });
    if (input.paidAt > todayISO(1)) throw new UserError("The payment date can't be in the future.", { paidAt: "In the future." });
    const r = await recordPayment(db, input);
    if (r.existed) return { ...r, message: `Already recorded as ${r.number}` };

    const c = await maybe<{ name: string; email: string | null }>(adminDb.from(tbl(schema.customers)).select("name,email").eq("id", r.customerId!));
    const what = input.paymentType === "ADVANCE" ? "advance" : "payment";
    const where = r.bookingNumber ? ` on ${r.bookingNumber}` : " (not yet assigned to a booking)";
    await audit(user, "create", "payment", r.paymentId, `Recorded ${what} ${r.number}: ${npr(input.amount)}${where}`, {
      customerId: r.customerId,
      bookingId: r.bookingId,
      invoiceId: r.invoiceId,
      amount: input.amount,
      method: input.method,
      excess: r.excess,
    });
    const href = `/admin/finance/payments/${r.paymentId}`;
    await notify({
      type: input.paymentType === "ADVANCE" ? "payment.advance" : "payment.received",
      title: `${input.paymentType === "ADVANCE" ? "Advance" : "Payment"} received: ${npr(input.amount)}`,
      body: `${c?.name ?? "Customer"}${r.bookingNumber ? ` · ${r.bookingNumber}` : ""}${r.autoConfirmed ? " · booking confirmed" : ""}`,
      href,
      entityType: "payment",
      entityId: r.paymentId,
      permission: "payments.view",
      dedupeKey: `payment.received:${r.paymentId}`,
    });
    if (r.invoiceId && r.invoiceStatus === "PAID") {
      const inv = await maybe<{ number: string }>(adminDb.from(tbl(schema.invoices)).select("number").eq("id", r.invoiceId));
      await notify({ type: "invoice.paid", title: `Invoice ${inv?.number ?? ""} paid in full`, body: c?.name, href: `/admin/invoices/${r.invoiceId}`, entityType: "invoice", entityId: r.invoiceId, permission: "invoices.view", dedupeKey: `invoice.paid:${r.invoiceId}` });
    }
    if (r.needsAllocation || (r.excess ?? 0) > 0 || !r.bookingId) {
      await notify({
        type: "payment.allocation",
        title: `Allocate ${r.number}`,
        body: !r.bookingId ? "Held as customer credit — assign it to a booking." : (r.excess ?? 0) > 0 ? `${npr(r.excess)} above the booking balance is held as customer credit.` : "The booking has more than one open invoice — choose which one it pays.",
        href,
        priority: "HIGH",
        entityType: "payment",
        entityId: r.paymentId,
        permission: "payments.create",
        dedupeKey: `payment.allocation:${r.paymentId}`,
      });
    }
    if (sendReceipt && c?.email) {
      const ev = r.bookingId ? await maybe<{ title: string }>(adminDb.from(tbl(schema.events)).select("title").eq("booking_id", r.bookingId).limit(1)) : null;
      await sendEmail(c.email, "paymentReceipt", { name: c.name, receipt: r.number, amount: input.amount, balance: r.balance ?? 0, title: ev?.title ?? r.bookingNumber ?? "your booking" }, { entityType: "payment", entityId: r.paymentId });
    }
    return r;
  },
);

/* ───────── Allocation ───────── */

export const allocatePaymentAction = adminAction(
  "payments.create",
  z.object({ paymentId: zs.uuid(), invoiceId: zs.uuid(), amount: z.coerce.number().int().positive().optional().nullable() }),
  async ({ paymentId, invoiceId, amount }, user) => {
    const r = await allocatePayment(db, paymentId, invoiceId, amount ?? null);
    if (!r.existed) await audit(user, "allocate", "payment", paymentId, `Applied ${npr(r.amount)} of ${r.paymentNumber} to invoice ${r.invoiceNumber}`, { invoiceId, amount: r.amount });
    return r;
  },
);

export const releaseAllocationAction = adminAction("payments.adjust", z.object({ allocationId: zs.uuid(), reason: reason() }), async ({ allocationId, reason }, user) => {
  const r = await releaseAllocation(db, allocationId, reason);
  if (!r.existed) await audit(user, "release", "payment", r.paymentId ?? null, `Took ${npr(r.amount)} off an invoice: ${reason}`, { allocationId, invoiceId: r.invoiceId });
  return r;
});

export const assignBookingAction = adminAction("payments.create", z.object({ paymentId: zs.uuid(), bookingId: zs.uuid() }), async ({ paymentId, bookingId }, user) => {
  const r = await assignPaymentBooking(db, paymentId, bookingId);
  if (!r.existed) await audit(user, "assign", "payment", paymentId, `Assigned ${r.paymentNumber} to booking ${r.bookingNumber}`, { bookingId });
  return r;
});

/* ───────── Corrections ───────── */

export const reversePaymentAction = adminAction("payments.adjust", z.object({ id: zs.uuid(), reason: reason() }), async ({ id, reason }, user) => {
  const r = await reversePayment(db, id, reason);
  if (r.existed) return r;
  await audit(user, "reverse", "payment", id, `Reversed payment ${r.paymentNumber} (${npr(r.amount)}) as ${r.number}: ${reason}`, { reversal: r.number, bookingId: r.bookingId, customerId: r.customerId });
  await notify({ type: "payment.reversed", title: `Payment ${r.paymentNumber} reversed`, body: `${npr(r.amount)} — ${reason}`, href: `/admin/finance/payments/${id}`, entityType: "payment", entityId: id, permission: "payments.view", dedupeKey: `payment.reversed:${id}` });
  return r;
});

export const refundPaymentAction = adminAction(
  "payments.adjust",
  z.object({
    id: zs.uuid(),
    amount: zs.money().refine((n) => n > 0, "Enter an amount above zero."),
    refundedOn: isoDate("refund date"),
    method: z.enum(FORM_METHODS),
    reference: zs.optional(120),
    reason: reason(),
    idempotencyKey: zs.uuid(),
  }),
  async ({ id, ...input }, user) => {
    const r = await refundPayment(db, { paymentId: id, ...input });
    if (r.existed) return r;
    await audit(user, "refund", "payment", id, `Refunded ${npr(input.amount)} of ${r.paymentNumber} as ${r.number}: ${input.reason}`, { refund: r.number, bookingId: r.bookingId, customerId: r.customerId });
    await notify({ type: "payment.refunded", title: `Refund ${r.number}: ${npr(input.amount)}`, body: `${r.paymentNumber} — ${input.reason}`, href: `/admin/finance/payments/${id}`, entityType: "payment", entityId: id, permission: "payments.view", dedupeKey: `payment.refunded:${r.adjustmentId}` });
    return r;
  },
);

export const emailReceiptAction = adminAction("payments.create", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const p = await maybe<{ number: string; netAmount: number; status: string; customerId: string; bookingId: string | null; bookingNumber: string | null; eventTitle: string | null }>(
    adminDb.from("payment_ledger").select("number,netAmount:net_amount,status,customerId:customer_id,bookingId:booking_id,bookingNumber:booking_number,eventTitle:event_title").eq("id", id),
  );
  if (!p) throw new UserError("Payment not found.");
  if (p.status === "REVERSED" || p.netAmount <= 0) throw new UserError("A reversed or fully refunded payment has no receipt to send.");
  const c = await maybe<{ name: string; email: string | null }>(adminDb.from(tbl(schema.customers)).select("name,email").eq("id", p.customerId));
  if (!c?.email) throw new UserError("This customer has no email address.");
  const bf = p.bookingId ? await maybe<{ outstanding: number }>(adminDb.from("booking_finance").select("outstanding").eq("booking_id", p.bookingId)) : null;
  await sendEmail(c.email, "paymentReceipt", { name: c.name, receipt: p.number, amount: p.netAmount, balance: bf?.outstanding ?? 0, title: p.eventTitle ?? p.bookingNumber ?? "your booking" }, { entityType: "payment", entityId: id });
  await audit(user, "send", "payment", id, `Emailed receipt ${p.number} to ${c.email}`);
});

/* ───────── Invoices ───────── */

export const createInvoiceAction = adminAction(
  "invoices.create",
  z.object({ bookingId: zs.uuid(), dueDate: zs.date(), notes: zs.optional(2000), send: z.boolean().default(false) }),
  async ({ bookingId, ...opts }, user) => {
    const r = await createInvoice(db, bookingId, opts);
    await audit(user, "create", "invoice", r.invoiceId, `Created invoice ${r.number} (${npr(r.total)})${r.applied ? ` — ${npr(r.applied)} already received applied` : ""}`, { bookingId, applied: r.applied });
    return { id: r.invoiceId, number: r.number, applied: r.applied, due: r.due };
  },
);

export const reviseInvoiceAction = adminAction(
  "invoices.update",
  z.object({ id: zs.uuid(), dueDate: zs.date(), notes: zs.optional(2000), reason: reason("Reason for the revision"), send: z.boolean().default(true) }),
  async ({ id, reason, ...opts }, user) => {
    const old = await maybe<{ bookingId: string; number: string }>(db.from(tbl(schema.invoices)).select("bookingId:booking_id,number").eq("id", id));
    if (!old) throw new UserError("Invoice not found.");
    const r = await createInvoice(db, old.bookingId, { ...opts, revisionOf: id, revisionReason: reason });
    await audit(user, "revise", "invoice", r.invoiceId, `Revised ${old.number} as ${r.number}: ${reason}`, { revisionOf: id, applied: r.applied });
    await audit(user, "cancel", "invoice", id, `Cancelled ${old.number} — replaced by ${r.number}: ${reason}`);
    return { id: r.invoiceId, number: r.number };
  },
);

export const cancelInvoiceAction = adminAction("invoices.update", z.object({ id: zs.uuid(), reason: reason() }), async ({ id, reason }, user) => {
  const r = await cancelInvoice(db, id, reason);
  if (!r.existed) await audit(user, "cancel", "invoice", id, `Cancelled invoice ${r.number}: ${reason}${r.released ? ` — ${npr(r.released)} of payments returned to the booking` : ""}`);
});

export const issueInvoiceAction = adminAction("invoices.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const inv = await issueInvoice(db, id);
  await audit(user, "send", "invoice", id, `Issued invoice ${inv.number}`);
});

/** Due date and notes. Issued invoices keep their amounts; changes are logged with old → new. */
export const updateInvoiceAction = adminAction("invoices.update", z.object({ id: zs.uuid(), dueDate: zs.date(), notes: zs.optional(2000) }), async ({ id, dueDate, notes }, user) => {
  const inv = await maybe<{ number: string; status: string; dueDate: string | null; notes: string | null }>(db.from(tbl(schema.invoices)).select("number,status,dueDate:due_date,notes").eq("id", id));
  if (!inv) throw new UserError("Invoice not found.");
  if (inv.status === "CANCELLED") throw new UserError("This invoice is cancelled.");
  await exec(db.from(tbl(schema.invoices)).update({ due_date: dueDate, notes }).eq("id", id));
  const changes = [inv.dueDate !== dueDate ? `due ${fmtDate(inv.dueDate)} → ${fmtDate(dueDate)}` : null, inv.notes !== notes ? "notes" : null].filter(Boolean).join(", ");
  if (changes) await audit(user, "update", "invoice", id, `Updated invoice ${inv.number}: ${changes}`, { before: { dueDate: inv.dueDate, notes: inv.notes }, after: { dueDate, notes } });
});
