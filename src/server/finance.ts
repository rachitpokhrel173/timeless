import "server-only";
import { adminDb, all, cols, exec, many, maybe, one, schema, tbl, vals, type DB, type Row } from "@/db";
import { UserError } from "@/lib/actions";
import { todayISO } from "@/lib/format";
import { nextNumber } from "./numbering";

/*
 * Money rules
 * - Booking and invoice "amount paid" are maintained by database triggers on payments
 *   (supabase/migrations/00009_finance.sql), in the same statement as the payment.
 * - Payments are voided, never deleted. Invoices are cancelled, never deleted.
 */

type Actor = { id: string; name: string } | null;
type Conn = DB;
type Booking = Row<typeof schema.bookings>;
type Invoice = Row<typeof schema.invoices>;
const bt = tbl(schema.bookings);
const pt = tbl(schema.payments);
const it = tbl(schema.invoices);
const getBooking = (conn: Conn, id: string) => maybe<Booking>(conn.from(bt).select(cols(schema.bookings)).eq("id", id));

export const PAYMENT_METHODS = schema.paymentMethod.enumValues;

export const balanceOf = (booking: { totalAmount: number; amountPaid: number }) => Math.max(0, booking.totalAmount - booking.amountPaid);

/**
 * Record a customer payment against a booking (and its open invoice). It can't exceed the
 * outstanding balance. A pending booking is confirmed once its deposit is covered.
 */
export async function recordPayment(
  conn: Conn,
  input: {
    bookingId: string;
    amount: number;
    method: (typeof PAYMENT_METHODS)[number];
    paidAt: string;
    reference?: string | null;
    notes?: string | null;
    invoiceId?: string | null;
  },
  actor: Actor,
) {
  const booking = await getBooking(conn, input.bookingId);
  if (!booking) throw new UserError("Booking not found.");
  if (booking.status === "CANCELLED") throw new UserError("This booking is cancelled.");
  if (input.amount <= 0) throw new UserError("Enter an amount above zero.", { amount: "Must be more than 0." });
  const balance = balanceOf(booking);
  if (input.amount > balance) throw new UserError(`That's more than the outstanding balance (NPR ${balance.toLocaleString("en-IN")}).`, { amount: "More than the balance." });
  if (input.paidAt > todayISO(1)) throw new UserError("The payment date can't be in the future.", { paidAt: "In the future." });

  let invoiceId = input.invoiceId ?? null;
  if (invoiceId) {
    const inv = await maybe<{ status: string }>(conn.from(it).select("status").eq("id", invoiceId).eq("booking_id", booking.id));
    if (!inv || inv.status === "CANCELLED") throw new UserError("Choose an active invoice for this booking.");
  } else {
    const open = await maybe<{ id: string }>(conn.from(it).select("id").eq("booking_id", booking.id).not("status", "in", "(CANCELLED,PAID,DRAFT)").order("created_at").limit(1));
    invoiceId = open?.id ?? null;
  }

  const payment = await one<Row<typeof schema.payments>>(
    conn
      .from(pt)
      .insert(vals(schema.payments, { ...input, invoiceId, number: await nextNumber("RC", conn), customerId: booking.customerId, recordedBy: actor?.id }))
      .select(cols(schema.payments)),
  );

  const after = await one<{ amountPaid: number; status: string; depositAmount: number }>(
    conn.from(bt).select("amountPaid:amount_paid,status,depositAmount:deposit_amount").eq("id", booking.id),
  );
  let autoConfirmed = false;
  if (after.status === "PENDING" && after.amountPaid >= after.depositAmount) {
    await exec(conn.from(bt).update({ status: "CONFIRMED", confirmed_at: new Date().toISOString() }).eq("id", booking.id));
    autoConfirmed = true;
  }
  return { payment, booking, paid: after.amountPaid, balance: Math.max(0, booking.totalAmount - after.amountPaid), autoConfirmed };
}

export async function voidPayment(conn: Conn, id: string, reason: string) {
  const payment = await maybe<Row<typeof schema.payments>>(conn.from(pt).select(cols(schema.payments)).eq("id", id));
  if (!payment) throw new UserError("Payment not found.");
  if (payment.voidedAt) throw new UserError("This payment is already void.");
  await exec(conn.from(pt).update({ voided_at: new Date().toISOString(), void_reason: reason }).eq("id", id));
  return payment;
}

/** Invoice for a booking, itemised from its booked items (or a single line for the contract value). */
export async function createInvoice(conn: Conn, bookingId: string, actor: Actor, opts: { dueDate?: string | null; notes?: string | null; send?: boolean } = {}) {
  const booking = await getBooking(conn, bookingId);
  if (!booking) throw new UserError("Booking not found.");
  if (booking.status === "CANCELLED") throw new UserError("This booking is cancelled.");
  const event = await maybe<{ title: string; date: string }>(conn.from(tbl(schema.events)).select("title,date:event_date").eq("booking_id", bookingId).limit(1));
  const booked = await many<Row<typeof schema.bookingItems>>(conn.from(tbl(schema.bookingItems)).select(cols(schema.bookingItems)).eq("booking_id", bookingId).order("position"));

  let items = booked.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount }));
  let subtotal = items.reduce((s, l) => s + l.amount, 0);
  let discountAmount = 0;
  let taxAmount = 0;
  if (booking.quotationId) {
    const quote = await maybe<{ total: number; subtotal: number; discountAmount: number; taxAmount: number }>(
      conn.from(tbl(schema.quotations)).select("total,subtotal,discountAmount:discount_amount,taxAmount:tax_amount").eq("id", booking.quotationId),
    );
    if (quote && quote.total === booking.totalAmount && quote.subtotal === subtotal) {
      discountAmount = quote.discountAmount;
      taxAmount = quote.taxAmount;
    }
  }
  // Items no longer add up to the contract (price changed after booking): bill the contract value
  if (!items.length || subtotal - discountAmount + taxAmount !== booking.totalAmount) {
    items = [{ description: `Event décor — ${event?.title ?? booking.number}`, quantity: 1, unitPrice: booking.totalAmount, amount: booking.totalAmount }];
    subtotal = booking.totalAmount;
    discountAmount = 0;
    taxAmount = 0;
  }

  const invoiceValues = vals(schema.invoices, {
    number: await nextNumber("INV", conn),
    bookingId,
    customerId: booking.customerId,
    dueDate: opts.dueDate ?? booking.balanceDueDate ?? event?.date,
    status: opts.send ? "SENT" : "DRAFT",
    sentAt: opts.send ? new Date() : null,
    subtotal,
    discountAmount,
    taxAmount,
    total: booking.totalAmount,
    notes: opts.notes,
    createdBy: actor?.id,
  });
  const invoice = await one<Invoice>(conn.from(it).insert(invoiceValues).select(cols(schema.invoices)));
  await exec(
    conn.from(tbl(schema.invoiceItems)).insert(
      vals(
        schema.invoiceItems,
        items.map((line, position) => ({ ...line, invoiceId: invoice.id, position })),
      ),
    ),
  );
  // Payments already made on the booking count towards this invoice (trigger recalculates the balance)
  await exec(conn.from(pt).update({ invoice_id: invoice.id }).eq("booking_id", bookingId).is("invoice_id", null));
  return invoice;
}

export async function setInvoiceStatus(conn: Conn, id: string, action: "SEND" | "CANCEL") {
  const inv = await maybe<Invoice>(conn.from(it).select(cols(schema.invoices)).eq("id", id));
  if (!inv) throw new UserError("Invoice not found.");
  if (inv.status === "CANCELLED") throw new UserError("This invoice is cancelled.");
  if (action === "SEND") {
    // Status becomes SENT / PARTIALLY_PAID / PAID / OVERDUE through the balance trigger
    await exec(conn.from(it).update({ status: "SENT", sent_at: new Date().toISOString() }).eq("id", id));
  } else {
    if (inv.amountPaid > 0) throw new UserError("Void or move this invoice's payments before cancelling it.");
    await exec(conn.from(it).update({ status: "CANCELLED", cancelled_at: new Date().toISOString() }).eq("id", id));
  }
  return inv;
}

/* ───────── Profitability ───────── */

export type EventProfit = {
  eventId: string;
  revenue: number;
  collected: number;
  outstanding: number;
  estimatedCost: number;
  vendorCost: number;
  staffCost: number;
  inventoryLoss: number;
  otherExpenses: number;
  actualCost: number;
  grossProfit: number;
  margin: number | null;
};

/**
 * Per event:
 *   revenue        booking value
 *   actual cost    vendor bookings + staff days × daily rate + damaged/lost/used décor at
 *                  replacement (or purchase) cost + other expenses linked to the event
 *   gross profit   revenue − actual cost
 * Expenses that pay a vendor booking aren't counted twice (the vendor booking already is).
 */
export async function eventProfits(eventIds: string[]): Promise<Map<string, EventProfit>> {
  if (!eventIds.length) return new Map();
  const total = (pairs: [string | null, number][]) => {
    const map = new Map<string, number>();
    for (const [id, n] of pairs) if (id) map.set(id, (map.get(id) ?? 0) + n);
    return map;
  };
  const [events, vendors, staff, loss, other] = await Promise.all([
    many<{ id: string; estimatedCost: number; booking: { totalAmount: number; amountPaid: number; status: string } | null }>(
      adminDb.from(tbl(schema.events)).select("id,estimatedCost:estimated_cost,booking:bookings(totalAmount:total_amount,amountPaid:amount_paid,status)").in("id", eventIds),
    ),
    all<{ eventId: string; cost: number }>(() =>
      adminDb.from(tbl(schema.vendorAssignments)).select("eventId:event_id,cost").in("event_id", eventIds).neq("status", "CANCELLED").order("id"),
    ),
    all<{ eventId: string; days: number; staff: { dailyRate: number } | null }>(() =>
      adminDb.from(tbl(schema.staffAssignments)).select("eventId:event_id,days,staff(dailyRate:daily_rate)").in("event_id", eventIds).order("id"),
    ),
    all<{
      returnedDamaged: number;
      returnedLost: number;
      used: number;
      inventory_reservations: { event_id: string };
      inventory_items: { replacement_cost: number; purchase_cost: number } | null;
    }>(() =>
      adminDb
        .from(tbl(schema.inventoryReservationItems))
        .select("returnedDamaged:returned_damaged,returnedLost:returned_lost,used,inventory_reservations!inner(event_id),inventory_items(replacement_cost,purchase_cost)")
        .in("inventory_reservations.event_id", eventIds)
        .order("id"),
    ),
    all<{ eventId: string; amount: number }>(() =>
      adminDb.from(tbl(schema.expenses)).select("eventId:event_id,amount").in("event_id", eventIds).is("voided_at", null).is("vendor_assignment_id", null).order("id"),
    ),
  ]);
  const vendorCost = total(vendors.map((v) => [v.eventId, Number(v.cost)]));
  const staffCost = total(staff.map((x) => [x.eventId, Number(x.days) * Number(x.staff?.dailyRate ?? 0)]));
  const inventoryLoss = total(
    loss.map((x) => [
      x.inventory_reservations.event_id,
      (x.returnedDamaged + x.returnedLost + Number(x.used)) * Number((x.inventory_items?.replacement_cost || x.inventory_items?.purchase_cost) ?? 0),
    ]),
  );
  const otherExpenses = total(other.map((x) => [x.eventId, x.amount]));
  const rows = events.map((e) => {
    const bk = e.booking && e.booking.status !== "CANCELLED" ? e.booking : null;
    return {
      id: e.id,
      revenue: bk?.totalAmount ?? 0,
      collected: bk?.amountPaid ?? 0,
      estimated_cost: Math.round(Number(e.estimatedCost)),
      vendor_cost: Math.round(vendorCost.get(e.id) ?? 0),
      staff_cost: Math.round(staffCost.get(e.id) ?? 0),
      inventory_loss: Math.round(inventoryLoss.get(e.id) ?? 0),
      other_expenses: Math.round(otherExpenses.get(e.id) ?? 0),
    };
  });
  return new Map(
    rows.map((r) => {
      const actualCost = r.vendor_cost + r.staff_cost + r.inventory_loss + r.other_expenses;
      const grossProfit = r.revenue - actualCost;
      return [
        r.id,
        {
          eventId: r.id,
          revenue: r.revenue,
          collected: r.collected,
          outstanding: Math.max(0, r.revenue - r.collected),
          estimatedCost: r.estimated_cost,
          vendorCost: r.vendor_cost,
          staffCost: r.staff_cost,
          inventoryLoss: r.inventory_loss,
          otherExpenses: r.other_expenses,
          actualCost,
          grossProfit,
          margin: r.revenue ? (grossProfit / r.revenue) * 100 : null,
        },
      ];
    }),
  );
}

/** How much has been paid on each vendor booking (from the expenses that pay it). */
export async function vendorPaid(assignmentIds: string[]) {
  if (!assignmentIds.length) return new Map<string, number>();
  const rows = await all<{ id: string; amount: number }>(() =>
    adminDb.from(tbl(schema.expenses)).select("id:vendor_assignment_id,amount").in("vendor_assignment_id", assignmentIds).is("voided_at", null).order("id"),
  );
  const paid = new Map<string, number>();
  for (const r of rows) paid.set(r.id, (paid.get(r.id) ?? 0) + r.amount);
  return paid;
}

export const vendorPaymentStatus = (cost: number, paid: number) => (paid <= 0 ? "PENDING" : paid >= cost ? "PAID" : "PARTIAL");
