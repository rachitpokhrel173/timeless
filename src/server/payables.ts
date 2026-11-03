import "server-only";
import { adminDb, many, maybe, schema, tbl } from "@/db";
import { BOOKING_FINANCE_COLS, type BookingFinance } from "./finance";

/*
 * What the payment form needs to show: a customer's active bookings with their balances and the
 * open invoices of each. Privileged reads — callers check payments.create first.
 */

export type PayableBooking = Pick<BookingFinance, "bookingId" | "bookingNumber" | "status" | "totalAmount" | "depositAmount" | "eventTitle" | "eventDate" | "received" | "outstanding" | "advanceReceived" | "paymentStatus"> & {
  invoices: { id: string; number: string; status: string; due: number }[];
};
export type PayableCustomer = { id: string; name: string; phone: string | null; email: string | null; bookings: PayableBooking[] };

export async function payableBookings(customerIds: string[]) {
  if (!customerIds.length) return new Map<string, PayableBooking[]>();
  const [rows, invoices] = await Promise.all([
    many<BookingFinance>(adminDb.from("booking_finance").select(BOOKING_FINANCE_COLS).in("customer_id", customerIds).neq("status", "CANCELLED").order("created_at", { ascending: false }).limit(200)),
    many<{ id: string; number: string; status: string; total: number; amountPaid: number; bookingId: string }>(
      adminDb.from(tbl(schema.invoices)).select("id,number,status,total,amountPaid:amount_paid,bookingId:booking_id").in("customer_id", customerIds).not("status", "in", "(CANCELLED,PAID)"),
    ),
  ]);
  const out = new Map<string, PayableBooking[]>();
  for (const b of rows) {
    const list = out.get(b.customerId) ?? [];
    list.push({
      bookingId: b.bookingId,
      bookingNumber: b.bookingNumber,
      status: b.status,
      totalAmount: b.totalAmount,
      depositAmount: b.depositAmount,
      eventTitle: b.eventTitle,
      eventDate: b.eventDate,
      received: b.received,
      outstanding: b.outstanding,
      advanceReceived: b.advanceReceived,
      paymentStatus: b.paymentStatus,
      invoices: invoices.filter((i) => i.bookingId === b.bookingId && i.amountPaid < i.total).map((i) => ({ id: i.id, number: i.number, status: i.status, due: i.total - i.amountPaid })),
    });
    out.set(b.customerId, list);
  }
  return out;
}

/** One customer's payable bookings (payment form opened from a customer, booking, event or invoice). */
export async function payableCustomer(customerId: string): Promise<PayableCustomer | null> {
  const c = await maybe<{ id: string; name: string; phone: string | null; email: string | null }>(adminDb.from(tbl(schema.customers)).select("id,name,phone,email").eq("id", customerId));
  if (!c) return null;
  return { ...c, bookings: (await payableBookings([c.id])).get(c.id) ?? [] };
}
