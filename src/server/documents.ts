import "server-only";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { getSiteSettings } from "@/lib/content";
import { fmtDateLong } from "@/lib/format";
import { methodLabel } from "@/lib/finance";
import { LEDGER_COLS, type LedgerRow } from "./finance";
import type { ComponentProps } from "react";
import type { BusinessDocument } from "@/components/documents/BusinessDocument";
import { quoteAcceptance } from "./sales";
import { signedUrl } from "./storage";

type DocProps = ComponentProps<typeof BusinessDocument>;
type Quote = Pick<
  Row<typeof schema.quotations>,
  "number" | "title" | "eventDate" | "venue" | "guestCount" | "issueDate" | "validUntil" | "subtotal" | "discountAmount" | "taxRate" | "taxAmount" | "total" | "depositPercent" | "depositAmount" | "terms" | "version"
> & { notes?: string | null; acceptedAt?: Date | string | null; acceptedName?: string | null };

export function quoteDocProps(
  brand: DocProps["brand"],
  quote: Quote,
  customer: { name: string; phone: string | null; email: string | null },
  items: { description: string; details: string | null; quantity: number; unit: string | null; unitPrice: number; amount: number }[],
): DocProps {
  const accepted = quoteAcceptance({ acceptedAt: quote.acceptedAt ?? null, acceptedName: quote.acceptedName ?? null });
  return {
    brand,
    kind: "Quotation",
    number: quote.version > 1 ? `${quote.number} · v${quote.version}` : quote.number,
    meta: [
      ["Event", quote.title],
      ["Event date", quote.eventDate ? fmtDateLong(quote.eventDate) : "To be confirmed"],
      ["Venue", quote.venue],
      ["Guests", quote.guestCount ? String(quote.guestCount) : null],
      ["Issued", fmtDateLong(quote.issueDate)],
      ["Valid until", quote.validUntil ? fmtDateLong(quote.validUntil) : null],
    ],
    billTo: { name: customer.name, lines: [customer.phone, customer.email] },
    lines: items,
    totals: [
      { label: "Subtotal", value: quote.subtotal },
      ...(quote.discountAmount ? [{ label: "Discount", value: quote.discountAmount, negative: true }] : []),
      ...(quote.taxAmount ? [{ label: `Tax (${quote.taxRate}%)`, value: quote.taxAmount }] : []),
      { label: "Total", value: quote.total, strong: true },
      ...(quote.depositAmount ? [{ label: "Advance to confirm", value: quote.depositAmount }] : []),
    ],
    notes: quote.notes,
    terms: quote.terms,
    signature: { acceptedOnline: accepted?.online && accepted.name ? { name: accepted.name, at: accepted.at } : null },
  };
}

/**
 * Reference images of a quotation as short-lived links, in their saved order. Call only after the
 * viewer is allowed to see the quotation (staff permission or the client's private token).
 */
export async function quoteImages(ids: string[] | null | undefined): Promise<{ id: string; src: string; alt: string }[]> {
  if (!ids?.length) return [];
  const rows = await many<{ id: string; bucket: string; path: string; alt: string; title: string | null }>(
    adminDb.from(tbl(schema.media)).select("id,bucket,path,alt,title").in("id", ids).is("deleted_at", null),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const found = ids.map((id) => byId.get(id)).filter((r) => !!r);
  // Long enough to read the page and print it
  const urls = await Promise.all(found.map((r) => signedUrl(r.bucket, r.path, 3600).catch(() => null)));
  return found.flatMap((r, i) => (urls[i] ? [{ id: r.id, src: urls[i], alt: r.alt || r.title || "Reference image" }] : []));
}

/** Invoice document with its payments (privileged read — call after a permission check). */
export async function invoiceDoc(id: string): Promise<DocProps | null> {
  const inv = await maybe<
    Row<typeof schema.invoices> & {
      customer: { name: string; phone: string | null; email: string | null; address: string | null };
      booking: { number: string; events: { title: string; eventDate: string; venue: string | null } | { title: string; eventDate: string; venue: string | null }[] | null };
    }
  >(
    adminDb
      .from(tbl(schema.invoices))
      .select(`${cols(schema.invoices)},customer:customers!inner(name,phone,email,address),booking:bookings!inner(number,events(title,eventDate:event_date,venue))`)
      .eq("id", id),
  );
  if (!inv) return null;
  const [items, settings, brand] = await Promise.all([
    many<Row<typeof schema.invoiceItems>>(adminDb.from(tbl(schema.invoiceItems)).select(cols(schema.invoiceItems)).eq("invoice_id", id).order("position")),
    maybe<{ value: { notes?: string; bankDetails?: string } }>(adminDb.from(tbl(schema.siteSettings)).select("value").eq("key", "invoice_settings")),
    getSiteSettings(),
  ]);
  const ev = Array.isArray(inv.booking.events) ? inv.booking.events[0] : inv.booking.events;
  const balance = Math.max(0, inv.total - inv.amountPaid);
  return {
    brand,
    kind: inv.status === "PAID" ? "Invoice · Paid" : inv.status === "CANCELLED" ? "Invoice · Cancelled" : "Invoice",
    number: inv.number,
    meta: [
      ["Booking", inv.booking.number],
      ["Event", ev?.title ?? null],
      ["Event date", ev ? fmtDateLong(ev.eventDate) : null],
      ["Issued", fmtDateLong(inv.issueDate)],
      ["Due", inv.dueDate ? fmtDateLong(inv.dueDate) : "On receipt"],
      ...(inv.cancelReason ? ([["Cancelled", inv.cancelReason]] as [string, string][]) : []),
    ],
    billTo: { name: inv.customer.name, lines: [inv.customer.address, inv.customer.phone, inv.customer.email] },
    lines: items.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount })),
    totals: [
      { label: "Subtotal", value: inv.subtotal },
      ...(inv.discountAmount ? [{ label: "Discount", value: inv.discountAmount, negative: true }] : []),
      ...(inv.taxAmount ? [{ label: "Tax", value: inv.taxAmount }] : []),
      { label: "Total", value: inv.total, strong: true },
      ...(inv.status === "CANCELLED"
        ? []
        : [
            ...(inv.priorPayments ? [{ label: "Previously received (advance)", value: Math.min(inv.priorPayments, inv.amountPaid), negative: true }] : []),
            ...(inv.amountPaid - Math.min(inv.priorPayments, inv.amountPaid) > 0
              ? [{ label: inv.priorPayments ? "Paid since" : "Paid", value: inv.amountPaid - Math.min(inv.priorPayments, inv.amountPaid), negative: true }]
              : []),
            { label: "Amount due", value: balance, strong: true },
          ]),
    ],
    notes: [inv.notes, settings?.value.bankDetails ? `Bank details:\n${settings.value.bankDetails}` : null].filter(Boolean).join("\n\n") || null,
    terms: settings?.value.notes ?? null,
  };
}

/**
 * Payment receipt (privileged read — call after a permission check). Only for money actually
 * held: none for a reversed or fully refunded payment. "Balance after this payment" counts the
 * booking's valid payments up to and including this one, so a reprint shows the same figure.
 */
export async function receiptDoc(id: string): Promise<DocProps | null> {
  const p = await maybe<LedgerRow>(adminDb.from("payment_ledger").select(LEDGER_COLS).eq("id", id));
  if (!p || p.status === "REVERSED" || p.netAmount <= 0) return null;
  const [customer, booking, brand] = await Promise.all([
    maybe<{ name: string; phone: string | null; email: string | null; address: string | null }>(adminDb.from(tbl(schema.customers)).select("name,phone,email,address").eq("id", p.customerId)),
    p.bookingId ? maybe<{ totalAmount: number }>(adminDb.from(tbl(schema.bookings)).select("totalAmount:total_amount").eq("id", p.bookingId)) : null,
    getSiteSettings(),
  ]);
  let paidToDate = 0;
  if (p.bookingId) {
    const all = await many<{ id: string; netAmount: number; paidAt: string; createdAt: Date }>(
      adminDb.from("payment_ledger").select("id,netAmount:net_amount,paidAt:paid_at,createdAt:created_at").eq("booking_id", p.bookingId).neq("status", "REVERSED"),
    );
    const key = (r: { paidAt: string; createdAt: Date }) => `${r.paidAt}|${new Date(r.createdAt).toISOString()}`;
    const mine = key(p);
    paidToDate = all.filter((r) => key(r) <= mine).reduce((s, r) => s + r.netAmount, 0);
  }
  const total = booking?.totalAmount ?? 0;
  return {
    brand,
    kind: "Payment receipt",
    number: p.number,
    meta: [
      ["Date received", fmtDateLong(p.paidAt)],
      ["Booking", p.bookingNumber ?? "Customer credit"],
      ["Event", p.eventTitle],
      ["Event date", p.eventDate ? fmtDateLong(p.eventDate) : null],
      ["Invoice", p.invoiceNumbers],
      ["Method", methodLabel(p.method)],
      ["Transaction ref.", p.reference],
      ["Received by", p.receivedBy ?? p.recordedByName],
    ],
    billTo: { name: customer?.name ?? p.customerName, lines: [customer?.address, customer?.phone, customer?.email] },
    lines: [
      {
        description: `${p.paymentType === "ADVANCE" ? "Advance payment" : "Payment"}${p.eventTitle ? ` — ${p.eventTitle}` : p.bookingNumber ? ` — ${p.bookingNumber}` : ""}`,
        quantity: 1,
        unitPrice: p.amount,
        amount: p.amount,
      },
    ],
    totals: [
      { label: "Amount received", value: p.amount, strong: true },
      ...(p.refunded ? [{ label: "Refunded", value: p.refunded, negative: true }] : []),
      ...(p.bookingId
        ? [
            { label: "Booking total", value: total },
            { label: "Paid to date", value: paidToDate },
            { label: "Balance after this payment", value: Math.max(0, total - paidToDate), strong: true },
          ]
        : []),
    ],
    notes: p.bookingId ? null : "Held as credit on your account and applied to your booking.",
    terms: null,
  };
}
