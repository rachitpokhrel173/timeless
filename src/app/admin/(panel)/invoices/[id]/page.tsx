import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr, todayISO, qty } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { PAYMENT_METHODS } from "@/server/finance";
import { INVOICE_STATUS, label, StatusBadge } from "@/components/admin/status";
import { Card, DetailList, EmptyState, LinkButton, Notice, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { PaymentButton } from "../../bookings/BookingClient";
import InvoiceActions from "../InvoiceClient";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: PageProps<"/admin/invoices/[id]">) {
  const user = await requirePage("invoices.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const inv = await maybe<Row<typeof schema.invoices> & { customer: { id: string; name: string; email: string | null }; booking: { id: string; number: string; totalAmount: number; amountPaid: number; status: string } }>(
    adminDb
      .from(tbl(schema.invoices))
      .select(`${cols(schema.invoices)},customer:customers!inner(id,name,email),booking:bookings!inner(id,number,totalAmount:total_amount,amountPaid:amount_paid,status)`)
      .eq("id", id),
  );
  if (!inv) notFound();
  const [items, payments] = await Promise.all([
    many<Row<typeof schema.invoiceItems>>(adminDb.from(tbl(schema.invoiceItems)).select(cols(schema.invoiceItems)).eq("invoice_id", id).order("position")),
    user.permissions.has("payments.view") ? many<Row<typeof schema.payments>>(adminDb.from(tbl(schema.payments)).select(cols(schema.payments)).eq("invoice_id", id).order("paid_at", { ascending: false })) : [],
  ]);
  const balance = Math.max(0, inv.total - inv.amountPaid);
  const bookingBalance = Math.max(0, inv.booking.totalAmount - inv.booking.amountPaid);
  const late = balance > 0 && inv.dueDate && inv.dueDate < todayISO() && inv.status !== "CANCELLED";

  return (
    <>
      <PageHeader
        back={{ href: "/admin/invoices", label: "Invoices" }}
        eyebrow={`Booking ${inv.booking.number}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {inv.number}
            <StatusBadge map={INVOICE_STATUS} value={inv.status} />
          </span>
        }
        description={
          <>
            <Link href={`/admin/customers/${inv.customer.id}`} className="font-medium text-a-text hover:underline">
              {inv.customer.name}
            </Link>{" "}
            · issued {fmtDate(inv.issueDate)} · due {fmtDate(inv.dueDate)}
          </>
        }
        actions={
          <>
            <LinkButton href={`/admin/print/invoice/${id}`} target="_blank" icon={Printer}>
              Print / PDF
            </LinkButton>
            {user.permissions.has("invoices.update") && <InvoiceActions id={id} status={inv.status} paid={inv.amountPaid} dueDate={inv.dueDate} notes={inv.notes} />}
            {user.permissions.has("payments.create") && inv.status !== "CANCELLED" && inv.booking.status !== "CANCELLED" && bookingBalance > 0 && (
              <PaymentButton
                bookingId={inv.booking.id}
                balance={Math.min(bookingBalance, balance || bookingBalance)}
                invoices={[{ value: id, label: inv.number }]}
                hasEmail={!!inv.customer.email}
                methods={PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }))}
              />
            )}
          </>
        }
      />
      {late && (
        <div className="mb-4">
          <Notice tone="danger" title="Overdue">
            {npr(balance)} was due on {fmtDate(inv.dueDate)}.
          </Notice>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card title="Items" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Rate</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <Td>{l.description}</Td>
                  <Td className="text-right tabular-nums">{qty(l.quantity)}</Td>
                  <Td className="text-right tabular-nums">{npr(l.unitPrice)}</Td>
                  <Td className="text-right tabular-nums">{npr(l.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <dl className="ml-auto max-w-xs space-y-1.5 p-4 text-[13px]">
            {[
              ["Subtotal", npr(inv.subtotal)],
              ...(inv.discountAmount ? [["Discount", `− ${npr(inv.discountAmount)}`]] : []),
              ...(inv.taxAmount ? [["Tax", npr(inv.taxAmount)]] : []),
              ["Total", npr(inv.total)],
              ["Paid", npr(inv.amountPaid)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt>{k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-a-border pt-1.5 text-base font-semibold">
              <dt>Balance due</dt>
              <dd className="tabular-nums">{npr(balance)}</dd>
            </div>
          </dl>
        </Card>
        <div className="space-y-4">
          <Card title="Details">
            <DetailList
              columns={1}
              items={[
                ["Booking", <Link key="b" href={`/admin/bookings/${inv.booking.id}`} className="hover:underline">{inv.booking.number}</Link>],
                ["Sent", inv.sentAt ? fmtDateTime(inv.sentAt) : "Not sent"],
                ["Notes", inv.notes],
                ...(inv.cancelledAt ? ([["Cancelled", fmtDateTime(inv.cancelledAt)]] as [string, string][]) : []),
              ]}
            />
          </Card>
          {user.permissions.has("payments.view") && (
            <Card title="Payments" bodyClassName="p-0">
              {payments.length === 0 ? (
                <EmptyState compact title="No payments yet" />
              ) : (
                <ul className="divide-y divide-a-border text-[13px]">
                  {payments.map((p) => (
                    <li key={p.id} className={`flex justify-between gap-2 px-4 py-2.5 ${p.voidedAt ? "text-a-muted line-through" : ""}`}>
                      <span>
                        {p.number}
                        <span className="block text-xs text-a-muted">
                          {fmtDate(p.paidAt)} · {label(p.method)}
                        </span>
                      </span>
                      <span className="font-medium tabular-nums">{npr(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
