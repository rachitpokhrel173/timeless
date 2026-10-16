"use server";

import { z } from "zod";
import { db, exec, maybe, one, schema, tbl, type Row } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/server/email";
import { notify } from "@/server/notifications";
import { sendPaymentReminderNow } from "@/server/payment-reminders";
import { createBooking, setBookingStatus } from "@/server/sales";

const time = () =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || /^\d{2}:\d{2}(:\d{2})?$/.test(v), "Enter a time like 18:30.");

const optInt = () =>
  z
    .union([z.coerce.number().int().min(0).max(100000), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v));

const bookingFields = z.object({
  customerId: zs.uuid(),
  title: zs.required("Title", 200),
  eventType: zs.optional(60),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the event date."),
  startTime: time(),
  endTime: time(),
  venue: zs.optional(200),
  venueAddress: zs.optional(300),
  guestCount: optInt(),
  packageId: zs.optUuid(),
  totalAmount: zs.money(),
  depositAmount: zs.money(),
  depositDueDate: zs.date(),
  balanceDueDate: zs.date(),
  status: z.enum(["PENDING", "CONFIRMED"]).default("PENDING"),
  requirements: zs.optional(4000),
});

export const createBookingAction = adminAction("bookings.create", bookingFields, async (input, user) => {
  const result = await createBooking(db, input, user);
  await audit(user, "create", "booking", result.booking.id, `Created booking ${result.booking.number}`);
  await notify({
    type: "booking.created",
    title: `New booking ${result.booking.number}`,
    body: input.title,
    href: `/admin/bookings/${result.booking.id}`,
    entityType: "booking",
    entityId: result.booking.id,
    permission: "bookings.view",
  });
  if (result.shortages)
    await notify({ type: "inventory.shortage", title: `Inventory shortage for ${result.booking.number}`, body: result.shortages, href: `/admin/events/${result.event.id}?tab=inventory`, priority: "URGENT", permission: "inventory.view" });
  return { id: result.booking.id, shortages: result.shortages };
});

export const updateBookingMoney = adminAction(
  "bookings.update",
  z.object({ id: zs.uuid(), totalAmount: zs.money(), depositAmount: zs.money(), depositDueDate: zs.date(), balanceDueDate: zs.date() }),
  async ({ id, ...v }, user) => {
    const b = await maybe<Row<typeof schema.bookings>>(db.from(tbl(schema.bookings)).select("number,amountPaid:amount_paid,status").eq("id", id));
    if (!b) throw new UserError("Booking not found.");
    if (b.status === "CANCELLED") throw new UserError("This booking is cancelled.");
    if (v.depositAmount > v.totalAmount) throw new UserError("The advance can't be more than the total.", { depositAmount: "More than the total." });
    if (v.totalAmount < b.amountPaid) throw new UserError(`The client has already paid more than that (${b.amountPaid.toLocaleString("en-IN")}).`, { totalAmount: "Less than already paid." });
    await exec(
      db
        .from(tbl(schema.bookings))
        .update({ total_amount: v.totalAmount, deposit_amount: v.depositAmount, deposit_due_date: v.depositDueDate, balance_due_date: v.balanceDueDate })
        .eq("id", id),
    );
    await audit(user, "update", "booking", id, `Updated amounts on ${b.number}`, { totalAmount: v.totalAmount, depositAmount: v.depositAmount });
  },
);

export const sendPaymentReminderAction = adminAction("payments.create", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const r = await sendPaymentReminderNow(id);
  if (r.status === "NOT_FOUND") throw new UserError("Booking not found.");
  if (r.status === "NOTHING_DUE") throw new UserError("Nothing is owed on this booking.");
  if (r.status === "NO_EMAIL") throw new UserError("This client has no email address. Add one to the customer, or remind them on WhatsApp.");
  if (r.status === "NOT_CONFIGURED") throw new UserError("Email isn't connected (Settings → System health), so the reminder was only recorded in the outbox.");
  if (r.status === "FAILED") throw new UserError("The email couldn't be sent. Try again in a minute.");
  await audit(user, "remind", "booking", id, `Emailed a payment reminder for ${r.due!.stage === "advance" ? "the advance" : "the balance"}`);
});

export const setBookingStatusAction = adminAction(
  ["bookings.update", "bookings.cancel"],
  z.object({ id: zs.uuid(), status: z.enum(["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]), reason: zs.optional(500), notify: z.boolean().default(false) }),
  async ({ id, status, reason, notify: emailClient }, user) => {
    if (status === "CANCELLED" ? !user.permissions.has("bookings.cancel") : !user.permissions.has("bookings.update")) throw new UserError("You don't have permission to do that.");
    if (status === "CANCELLED" && !reason) throw new UserError("Give a reason for cancelling.", { reason: "Required." });
    const b = await setBookingStatus(db, id, status, user, reason);
    await audit(user, "status", "booking", id, `${b.number} → ${status.toLowerCase().replace("_", " ")}${reason ? `: ${reason}` : ""}`);
    if (status === "CONFIRMED" && emailClient) {
      const info = await one<{ c: { name: string; email: string | null }; e: { title: string; eventDate: string; venue: string | null } | { title: string; eventDate: string; venue: string | null }[] | null }>(
        db.from(tbl(schema.bookings)).select("c:customers!inner(name,email),e:events(title,eventDate:event_date,venue)").eq("id", id),
      );
      const ev = Array.isArray(info.e) ? info.e[0] : info.e;
      if (ev) await sendEmail(info.c.email, "bookingConfirmation", { name: info.c.name, number: b.number, title: ev.title, date: ev.eventDate, venue: ev.venue }, { entityType: "booking", entityId: id });
    }
    if (status === "CANCELLED")
      await notify({ type: "booking.cancelled", title: `${b.number} cancelled`, body: reason ?? undefined, href: `/admin/bookings/${id}`, priority: "HIGH", entityType: "booking", entityId: id, permission: "bookings.view" });
  },
);
