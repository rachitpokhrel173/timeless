import "server-only";
import { adminDb, all, maybe, schema, tbl } from "@/db";
import { todayISO } from "@/lib/format";
import { sendEmail } from "./email";

/*
 * Payment reminders to clients. The advance comes first: until it is covered, that is what the
 * client is reminded about; after that, the remaining balance. The daily sweep sends one "due soon"
 * email inside the reminder window and one "overdue" email within a week of the due date — each at
 * most once per booking, stage and due date (moving the due date re-arms it). Staff can also send a
 * reminder by hand from the booking.
 */

type ReminderBooking = {
  id: string;
  number: string;
  status: string;
  totalAmount: number;
  depositAmount: number;
  amountPaid: number;
  depositDueDate: string | null;
  balanceDueDate: string | null;
  c: { name: string; email: string | null };
  e: { title: string; eventDate: string } | { title: string; eventDate: string }[] | null;
};

const SELECT =
  "id,number,status,totalAmount:total_amount,depositAmount:deposit_amount,amountPaid:amount_paid,depositDueDate:deposit_due_date,balanceDueDate:balance_due_date,c:customers!inner(name,email),e:events(title,eventDate:event_date)";

/** Overdue reminders older than this aren't sent, so switching the rule on doesn't email about old debts. */
const OVERDUE_WINDOW_DAYS = 7;

const daysUntil = (date: string, today: string) => Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);

/** What the client should pay next, or null when nothing is owed. */
export function amountDue(b: Pick<ReminderBooking, "totalAmount" | "depositAmount" | "amountPaid" | "depositDueDate" | "balanceDueDate">) {
  if (b.depositAmount > b.amountPaid) return { stage: "advance" as const, amount: b.depositAmount - b.amountPaid, dueDate: b.depositDueDate };
  if (b.totalAmount > b.amountPaid) return { stage: "balance" as const, amount: b.totalAmount - b.amountPaid, dueDate: b.balanceDueDate };
  return null;
}

async function bankDetails() {
  const row = await maybe<{ value: { bankDetails?: string } }>(adminDb.from(tbl(schema.siteSettings)).select("value").eq("key", "invoice_settings"));
  return row?.value.bankDetails?.trim() || null;
}

function send(b: ReminderBooking, due: NonNullable<ReturnType<typeof amountDue>>, bank: string | null, ref: { entityType: string; entityId: string }) {
  const event = Array.isArray(b.e) ? b.e[0] : b.e;
  return sendEmail(
    b.c.email,
    "paymentReminder",
    { name: b.c.name, booking: b.number, title: event?.title ?? b.number, eventDate: event?.eventDate, stage: due.stage, amount: due.amount, dueDate: due.dueDate, bankDetails: bank },
    ref,
  );
}

/** Send a reminder now for one booking (the "Send payment reminder" button). */
export async function sendPaymentReminderNow(bookingId: string) {
  const b = await maybe<ReminderBooking>(adminDb.from(tbl(schema.bookings)).select(SELECT).eq("id", bookingId));
  if (!b) return { status: "NOT_FOUND" as const };
  const due = amountDue(b);
  if (!due) return { status: "NOTHING_DUE" as const };
  if (!b.c.email) return { status: "NO_EMAIL" as const };
  return { status: await send(b, due, await bankDetails(), { entityType: "booking", entityId: b.id }), due };
}

export type OutstandingBooking = {
  id: string;
  number: string;
  customer: string;
  email: string | null;
  title: string;
  eventDate: string | null;
  total: number;
  paid: number;
  due: NonNullable<ReturnType<typeof amountDue>>;
};

/** Active bookings with money still owed, soonest due first (for Record payment and the reminders list). */
export async function outstandingBookings(): Promise<OutstandingBooking[]> {
  const rows = await all<ReminderBooking>(() =>
    adminDb.from(tbl(schema.bookings)).select(SELECT).in("status", ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED"]).is("archived_at", null).order("id"),
  );
  return rows
    .flatMap((b) => {
      const due = amountDue(b);
      if (!due) return [];
      const event = Array.isArray(b.e) ? b.e[0] : b.e;
      return [{ id: b.id, number: b.number, customer: b.c.name, email: b.c.email, title: event?.title ?? b.number, eventDate: event?.eventDate ?? null, total: b.totalAmount, paid: b.amountPaid, due }];
    })
    .sort((a, b) => (a.due.dueDate ?? "9999").localeCompare(b.due.dueDate ?? "9999"));
}

/** Daily sweep: returns how many reminders went out (or were recorded, when email isn't connected). */
export async function runPaymentReminders(config: { daysBefore?: unknown; overdueReminder?: unknown }) {
  const today = todayISO();
  const window = Math.max(0, Number(config.daysBefore ?? 3));
  const bookings = await all<ReminderBooking>(() =>
    adminDb
      .from(tbl(schema.bookings))
      .select(SELECT)
      .in("status", ["PENDING", "CONFIRMED", "IN_PROGRESS"])
      .is("archived_at", null)
      .not("c.email", "is", null)
      .order("id"),
  );
  let soon = 0;
  let late = 0;
  let bank: string | null | undefined;
  for (const b of bookings) {
    const due = amountDue(b);
    if (!due?.dueDate || !b.c.email) continue;
    const left = daysUntil(due.dueDate, today);
    const kind = left >= 0 && left <= window ? "soon" : left < 0 && left >= -OVERDUE_WINDOW_DAYS && config.overdueReminder !== false ? "late" : null;
    if (!kind) continue;
    const key = `${b.id}:${due.stage}:${due.dueDate}:${kind}`;
    const already = await maybe<{ id: string }>(
      adminDb.from(tbl(schema.emailOutbox)).select("id").eq("entity_type", "payment-reminder").eq("entity_id", key).neq("status", "FAILED").limit(1),
    );
    if (already) continue;
    bank ??= await bankDetails();
    await send(b, due, bank, { entityType: "payment-reminder", entityId: key });
    if (kind === "soon") soon++;
    else late++;
  }
  return { soon, late };
}
