import "server-only";
import { adminDb, all, many, maybe, rpc, schema, tbl, type DB } from "@/db";
import { UserError } from "@/lib/actions";
import { ALL_METHODS, type PaymentMethod } from "@/lib/finance";

/*
 * Finance service — the only place the app records or reads money.
 *
 * Writes go through database functions (supabase/migrations/00023_phase4_finance.sql), each one
 * transaction with its own locks, limits and permission checks:
 *   record_payment · allocate_payment · release_allocation · create_booking_invoice ·
 *   cancel_invoice · reverse_payment · refund_payment · assign_payment_booking
 * Every entry point in the app (customer, booking, event, invoice, finance pages) calls these —
 * there is one payment workflow, not one per page.
 *
 * Reads come from the views payment_ledger, booking_finance and customer_finance, so every page
 * shows the same received / outstanding / credit figures. Invoice and booking "amount paid" are
 * maintained by database triggers from allocations, payments, refunds and reversals.
 *
 * Rules: payments are reversed or refunded, never edited or deleted; issued invoices are revised
 * or cancelled, never rewritten; allocations are reversed and re-made, never edited.
 */

type Conn = DB;
export const PAYMENT_METHODS = ALL_METHODS;
export { type PaymentMethod };

export const balanceOf = (booking: { totalAmount: number; amountPaid: number }) => Math.max(0, booking.totalAmount - booking.amountPaid);

/* ───────── Writes ───────── */

export type RecordPaymentInput = {
  customerId?: string | null;
  bookingId?: string | null;
  invoiceId?: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  paymentType: "ADVANCE" | "PAYMENT";
  reference?: string | null;
  receivedBy?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  allowOverpayment?: boolean;
};
export type RecordPaymentResult = {
  paymentId: string;
  number: string;
  existed: boolean;
  customerId?: string;
  bookingId?: string | null;
  bookingNumber?: string | null;
  invoiceId?: string | null;
  invoiceStatus?: string | null;
  excess?: number;
  balance?: number;
  autoConfirmed?: boolean;
  needsAllocation?: boolean;
};

export async function recordPayment(conn: Conn, input: RecordPaymentInput) {
  if (!input.customerId && !input.bookingId) throw new UserError("Choose the customer or booking this payment is for.");
  return rpc<RecordPaymentResult>(conn, "record_payment", {
    p_customer: input.customerId ?? null,
    p_booking: input.bookingId ?? null,
    p_invoice: input.invoiceId ?? null,
    p_amount: input.amount,
    p_method: input.method,
    p_paid_at: input.paidAt,
    p_type: input.paymentType,
    p_reference: input.reference ?? null,
    p_received_by: input.receivedBy ?? null,
    p_notes: input.notes ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_allow_overpayment: !!input.allowOverpayment,
  });
}

export const allocatePayment = (conn: Conn, paymentId: string, invoiceId: string, amount?: number | null) =>
  rpc<{ allocationId: string; existed: boolean; amount?: number; paymentNumber?: string; invoiceNumber?: string }>(conn, "allocate_payment", {
    p_payment: paymentId,
    p_invoice: invoiceId,
    p_amount: amount ?? null,
  });

export const releaseAllocation = (conn: Conn, allocationId: string, reason: string) =>
  rpc<{ allocationId: string; existed: boolean; invoiceId?: string; paymentId?: string; amount?: number }>(conn, "release_allocation", { p_allocation: allocationId, p_reason: reason });

export const reversePayment = (conn: Conn, paymentId: string, reason: string) =>
  rpc<{ paymentId: string; number: string; existed: boolean; paymentNumber?: string; amount?: number; bookingId?: string | null; customerId?: string }>(conn, "reverse_payment", {
    p_payment: paymentId,
    p_reason: reason,
  });

export const refundPayment = (conn: Conn, input: { paymentId: string; amount: number; refundedOn: string; method: PaymentMethod; reason: string; reference?: string | null; idempotencyKey?: string | null }) =>
  rpc<{ adjustmentId: string; number: string; existed: boolean; paymentNumber?: string; amount?: number; bookingId?: string | null; customerId?: string }>(conn, "refund_payment", {
    p_payment: input.paymentId,
    p_amount: input.amount,
    p_refunded_on: input.refundedOn,
    p_method: input.method,
    p_reason: input.reason,
    p_reference: input.reference ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
  });

export const assignPaymentBooking = (conn: Conn, paymentId: string, bookingId: string) =>
  rpc<{ paymentId: string; existed: boolean; bookingId?: string; bookingNumber?: string; paymentNumber?: string }>(conn, "assign_payment_booking", { p_payment: paymentId, p_booking: bookingId });

/**
 * Invoice for a booking, itemised from its booked services. Payments already received for the
 * booking (the advance) are applied to it immediately. With revisionOf, the given issued invoice
 * is cancelled (with the reason) and replaced in the same transaction.
 */
export const createInvoice = (conn: Conn, bookingId: string, opts: { dueDate?: string | null; notes?: string | null; send?: boolean; revisionOf?: string | null; revisionReason?: string | null } = {}) =>
  rpc<{ invoiceId: string; number: string; applied: number; total: number; due: number; revisedNumber: string | null; released: number }>(conn, "create_booking_invoice", {
    p_booking: bookingId,
    p_due_date: opts.dueDate ?? null,
    p_notes: opts.notes ?? null,
    p_send: !!opts.send,
    p_revision_of: opts.revisionOf ?? null,
    p_revision_reason: opts.revisionReason ?? null,
  });

export const cancelInvoice = (conn: Conn, invoiceId: string, reason: string) =>
  rpc<{ invoiceId: string; existed: boolean; number?: string; released?: number }>(conn, "cancel_invoice", { p_invoice: invoiceId, p_reason: reason });

/** Issue a draft (status becomes Sent / Partially paid / Paid / Overdue through the balance trigger). */
export async function issueInvoice(conn: Conn, id: string) {
  const inv = await maybe<{ number: string; status: string }>(conn.from(tbl(schema.invoices)).select("number,status").eq("id", id));
  if (!inv) throw new UserError("Invoice not found.");
  if (inv.status === "CANCELLED") throw new UserError("This invoice is cancelled.");
  if (inv.status !== "DRAFT") return inv;
  const res = await conn.from(tbl(schema.invoices)).update({ status: "SENT", sent_at: new Date().toISOString() }).eq("id", id);
  if (res.error) throw new UserError(res.error.message);
  return inv;
}

/* ───────── Reads (privileged — call after a permission check) ───────── */

export type LedgerRow = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  bookingId: string | null;
  bookingNumber: string | null;
  eventId: string | null;
  eventTitle: string | null;
  eventDate: string | null;
  invoiceId: string | null;
  invoiceNumbers: string | null;
  amount: number;
  method: string;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  paymentType: "ADVANCE" | "PAYMENT";
  receivedBy: string | null;
  recordedByName: string | null;
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  refunded: number;
  netAmount: number;
  allocated: number;
  unallocated: number;
  status: "VALID" | "PARTIALLY_REFUNDED" | "REFUNDED" | "REVERSED";
  allocationState: "INVOICED" | "PARTIAL" | "BOOKING" | "UNASSIGNED" | "NONE";
};
export const LEDGER_COLS =
  "id,number,customerId:customer_id,customerName:customer_name,bookingId:booking_id,bookingNumber:booking_number,eventId:event_id,eventTitle:event_title,eventDate:event_date," +
  "invoiceId:invoice_id,invoiceNumbers:invoice_numbers,amount,method,paidAt:paid_at,reference,notes,paymentType:payment_type,receivedBy:received_by,recordedByName:recorded_by_name," +
  "createdAt:created_at,voidedAt:voided_at,voidReason:void_reason,refunded,netAmount:net_amount,allocated,unallocated,status,allocationState:allocation_state";

export type BookingFinance = {
  bookingId: string;
  bookingNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  totalAmount: number;
  depositAmount: number;
  depositDueDate: string | null;
  balanceDueDate: string | null;
  eventId: string | null;
  eventTitle: string | null;
  eventDate: string | null;
  quotationTotal: number | null;
  received: number;
  refunded: number;
  advanceReceived: number;
  unallocated: number;
  paymentCount: number;
  invoiced: number;
  invoicePaid: number;
  invoiceCount: number;
  invoiceDueDate: string | null;
  outstanding: number;
  credit: number;
  invoiceOutstanding: number;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID" | "CANCELLED";
};
export const BOOKING_FINANCE_COLS =
  "bookingId:booking_id,bookingNumber:booking_number,customerId:customer_id,customerName:customer_name,status,totalAmount:total_amount,depositAmount:deposit_amount," +
  "depositDueDate:deposit_due_date,balanceDueDate:balance_due_date,eventId:event_id,eventTitle:event_title,eventDate:event_date,quotationTotal:quotation_total,received,refunded," +
  "advanceReceived:advance_received,unallocated,paymentCount:payment_count,invoiced,invoicePaid:invoice_paid,invoiceCount:invoice_count,invoiceDueDate:invoice_due_date," +
  "outstanding,credit,invoiceOutstanding:invoice_outstanding,paymentStatus:payment_status";

export type CustomerFinance = {
  customerId: string;
  bookings: number;
  bookingValue: number;
  invoiced: number;
  received: number;
  outstanding: number;
  advanceReceived: number;
  unallocated: number;
  refunded: number;
  credit: number;
};

export const bookingFinance = (bookingId: string) => maybe<BookingFinance>(adminDb.from("booking_finance").select(BOOKING_FINANCE_COLS).eq("booking_id", bookingId));

export const customerFinance = (customerId: string) =>
  maybe<CustomerFinance>(
    adminDb
      .from("customer_finance")
      .select("customerId:customer_id,bookings,bookingValue:booking_value,invoiced,received,outstanding,advanceReceived:advance_received,unallocated,refunded,credit")
      .eq("customer_id", customerId),
  );

type LedgerFilter = { customerId?: string; bookingId?: string; paymentId?: string };
export function ledger(filter: LedgerFilter) {
  let q = adminDb.from("payment_ledger").select(LEDGER_COLS);
  if (filter.customerId) q = q.eq("customer_id", filter.customerId);
  if (filter.bookingId) q = q.eq("booking_id", filter.bookingId);
  if (filter.paymentId) q = q.eq("id", filter.paymentId);
  return many<LedgerRow>(q.order("paid_at", { ascending: false }).order("created_at", { ascending: false }));
}

export type Adjustment = { id: string; number: string; kind: "REFUND" | "REVERSAL"; paymentId: string; amount: number; adjustedOn: string; method: string | null; reference: string | null; reason: string; createdAt: Date; by: { fullName: string } | null };
export function adjustmentsFor(paymentIds: string[]) {
  if (!paymentIds.length) return Promise.resolve([] as Adjustment[]);
  return many<Adjustment>(
    adminDb
      .from(tbl(schema.paymentAdjustments))
      .select("id,number,kind,paymentId:payment_id,amount,adjustedOn:adjusted_on,method,reference,reason,createdAt:created_at,by:profiles!payment_adjustments_recorded_by_profiles_id_fk(fullName:full_name)")
      .in("payment_id", paymentIds)
      .order("created_at", { ascending: false }),
  );
}

export type Allocation = { id: string; paymentId: string; invoiceId: string; amount: number; createdAt: Date; reversedAt: Date | null; reversalReason: string | null; inv: { number: string }; pay: { number: string; paidAt: string; method: string } };
export function allocationsFor(by: { paymentIds?: string[]; invoiceId?: string }) {
  let q = adminDb
    .from(tbl(schema.paymentAllocations))
    .select("id,paymentId:payment_id,invoiceId:invoice_id,amount,createdAt:created_at,reversedAt:reversed_at,reversalReason:reversal_reason,inv:invoices!inner(number),pay:payments!inner(number,paidAt:paid_at,method)");
  if (by.paymentIds) {
    if (!by.paymentIds.length) return Promise.resolve([] as Allocation[]);
    q = q.in("payment_id", by.paymentIds);
  }
  if (by.invoiceId) q = q.eq("invoice_id", by.invoiceId);
  return many<Allocation>(q.order("created_at"));
}

/** Open invoices a payment can be applied to: same customer, same booking when it has one. */
export function allocatableInvoices(p: { customerId: string; bookingId: string | null }) {
  let q = adminDb
    .from(tbl(schema.invoices))
    .select("id,number,total,amountPaid:amount_paid,status,bookingId:booking_id")
    .eq("customer_id", p.customerId)
    .neq("status", "CANCELLED");
  if (p.bookingId) q = q.eq("booking_id", p.bookingId);
  return many<{ id: string; number: string; total: number; amountPaid: number; status: string; bookingId: string }>(q.order("created_at")).then((rows) => rows.filter((r) => r.amountPaid < r.total));
}

/** Business-wide figures for the Finance overview. Received money never includes reversals or refunds. */
export async function financeOverview(today: string) {
  const monthStart = `${today.slice(0, 8)}01`;
  const yearAgo = `${String(Number(today.slice(0, 4)) - 1)}${today.slice(4, 8)}01`;
  const [invoices, payments, bookings, refunds] = await Promise.all([
    all<{ total: number; amountPaid: number; status: string; dueDate: string | null }>(() =>
      adminDb.from(tbl(schema.invoices)).select("total,amountPaid:amount_paid,status,dueDate:due_date").not("status", "in", "(DRAFT,CANCELLED)").order("id"),
    ),
    all<{ netAmount: number; paidAt: string; paymentType: string; unallocated: number; bookingId: string | null }>(() =>
      adminDb.from("payment_ledger").select("netAmount:net_amount,paidAt:paid_at,paymentType:payment_type,unallocated,bookingId:booking_id").is("voided_at", null).order("id"),
    ),
    all<{ outstanding: number; credit: number; status: string; invoiceCount: number }>(() =>
      adminDb.from("booking_finance").select("outstanding,credit,status,invoiceCount:invoice_count").order("booking_id"),
    ),
    all<{ amount: number; adjustedOn: string }>(() => adminDb.from(tbl(schema.paymentAdjustments)).select("amount,adjustedOn:adjusted_on").eq("kind", "REFUND").order("id")),
  ]);
  const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
  const overdue = invoices.filter((i) => i.amountPaid < i.total && (i.status === "OVERDUE" || (!!i.dueDate && i.dueDate < today)));
  // Monthly money in (by payment date, net of refunds made on that payment) for the last 12 months
  const months = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1));
    months.set(d.toISOString().slice(0, 7), 0);
  }
  for (const p of payments) if (p.paidAt >= yearAgo && months.has(p.paidAt.slice(0, 7))) months.set(p.paidAt.slice(0, 7), months.get(p.paidAt.slice(0, 7))! + p.netAmount);
  return {
    totalInvoiced: sum(invoices, (i) => i.total),
    invoicePaid: sum(invoices, (i) => i.amountPaid),
    invoiceOutstanding: sum(invoices, (i) => Math.max(0, i.total - i.amountPaid)),
    totalReceived: sum(payments, (p) => p.netAmount),
    advanceReceived: sum(payments.filter((p) => p.paymentType === "ADVANCE"), (p) => p.netAmount),
    receivedThisMonth: sum(payments.filter((p) => p.paidAt >= monthStart), (p) => p.netAmount),
    paymentsThisMonth: payments.filter((p) => p.paidAt >= monthStart).length,
    bookingOutstanding: sum(bookings, (b) => b.outstanding),
    uninvoicedOutstanding: sum(bookings.filter((b) => b.invoiceCount === 0), (b) => b.outstanding),
    customerCredit: sum(bookings, (b) => b.credit) + sum(payments.filter((p) => !p.bookingId), (p) => p.netAmount),
    notOnInvoice: sum(payments.filter((p) => p.bookingId), (p) => p.unallocated),
    overdueAmount: sum(overdue, (i) => i.total - i.amountPaid),
    overdueCount: overdue.length,
    refundsThisMonth: sum(refunds.filter((r) => r.adjustedOn >= monthStart), (r) => r.amount),
    trend: [...months].map(([month, value]) => ({ month, value })),
  };
}

/* ───────── Profitability ───────── */

export type EventProfit = {
  eventId: string;
  revenue: number;
  invoiced: number;
  collected: number;
  refunded: number;
  outstanding: number;
  estimatedCost: number;
  vendorCost: number;
  staffCost: number;
  inventoryLoss: number;
  otherExpenses: number;
  actualCost: number;
  grossProfit: number;
  margin: number | null;
  /** True while the event isn't completed — expenses may still come in. */
  provisional: boolean;
};

/**
 * Per event:
 *   revenue        confirmed booking value (what the customer owes in total)
 *   invoiced       issued invoices for the booking
 *   collected      money actually received, net of refunds and reversals (cash, not profit)
 *   actual cost    vendor bookings + staff days × daily rate + damaged/lost/used décor at
 *                  replacement (or purchase) cost + other expenses recorded for the event
 *   gross profit   revenue − actual cost (an estimate until the event is completed)
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
    many<{ id: string; estimatedCost: number; status: string; bookingId: string | null }>(
      adminDb.from(tbl(schema.events)).select("id,estimatedCost:estimated_cost,status,bookingId:booking_id").in("id", eventIds),
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
  const bookingIds = events.map((e) => e.bookingId).filter((x): x is string => !!x);
  const money = bookingIds.length
    ? await many<{ bookingId: string; status: string; totalAmount: number; invoiced: number; received: number; refunded: number; outstanding: number }>(
        adminDb.from("booking_finance").select("bookingId:booking_id,status,totalAmount:total_amount,invoiced,received,refunded,outstanding").in("booking_id", bookingIds),
      )
    : [];
  const byBooking = new Map(money.map((m) => [m.bookingId, m]));
  const vendorCost = total(vendors.map((v) => [v.eventId, Number(v.cost)]));
  const staffCost = total(staff.map((x) => [x.eventId, Number(x.days) * Number(x.staff?.dailyRate ?? 0)]));
  const inventoryLoss = total(
    loss.map((x) => [
      x.inventory_reservations.event_id,
      (x.returnedDamaged + x.returnedLost + Number(x.used)) * Number((x.inventory_items?.replacement_cost || x.inventory_items?.purchase_cost) ?? 0),
    ]),
  );
  const otherExpenses = total(other.map((x) => [x.eventId, x.amount]));
  return new Map(
    events.map((e) => {
      const m = e.bookingId ? byBooking.get(e.bookingId) : undefined;
      const live = m && m.status !== "CANCELLED" ? m : null;
      const revenue = live?.totalAmount ?? 0;
      const vc = Math.round(vendorCost.get(e.id) ?? 0);
      const sc = Math.round(staffCost.get(e.id) ?? 0);
      const il = Math.round(inventoryLoss.get(e.id) ?? 0);
      const oe = Math.round(otherExpenses.get(e.id) ?? 0);
      const actualCost = vc + sc + il + oe;
      const grossProfit = revenue - actualCost;
      return [
        e.id,
        {
          eventId: e.id,
          revenue,
          invoiced: live?.invoiced ?? 0,
          collected: m?.received ?? 0,
          refunded: m?.refunded ?? 0,
          outstanding: live?.outstanding ?? 0,
          estimatedCost: Math.round(Number(e.estimatedCost)),
          vendorCost: vc,
          staffCost: sc,
          inventoryLoss: il,
          otherExpenses: oe,
          actualCost,
          grossProfit,
          margin: revenue ? (grossProfit / revenue) * 100 : null,
          provisional: e.status !== "COMPLETED",
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
