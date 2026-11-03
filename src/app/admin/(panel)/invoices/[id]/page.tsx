import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { methodLabel } from "@/lib/finance";
import { fmtDate, fmtDateTime, npr, todayISO, qty } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { allocationsFor } from "@/server/finance";
import { payableCustomer } from "@/server/payables";
import { INVOICE_STATUS, StatusBadge } from "@/components/admin/status";
import { InvoiceControls } from "@/components/admin/finance/FinanceActions";
import { RecordPaymentButton } from "@/components/admin/finance/RecordPayment";
import { Card, DetailList, EmptyState, LinkButton, Notice, PageHeader, Table, Td, Th } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Invoice" };

type Inv = Row<typeof schema.invoices> & {
  customer: { id: string; name: string; email: string | null };
  booking: { id: string; number: string; totalAmount: number; amountPaid: number; status: string; e: { id: string; title: string }[] } | null;
};

export default async function InvoicePage({ params }: PageProps<"/admin/invoices/[id]">) {
  const user = await requirePage("invoices.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const inv = await maybe<Inv>(
    adminDb
      .from(tbl(schema.invoices))
      .select(`${cols(schema.invoices)},customer:customers!inner(id,name,email),booking:bookings(id,number,totalAmount:total_amount,amountPaid:amount_paid,status,e:events(id,title))`)
      .eq("id", id),
  );
  if (!inv) notFound();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const [items, allocations, revisions, payable] = await Promise.all([
    many<Row<typeof schema.invoiceItems>>(adminDb.from(tbl(schema.invoiceItems)).select(cols(schema.invoiceItems)).eq("invoice_id", id).order("position")),
    can("payments.view") ? allocationsFor({ invoiceId: id }) : [],
    many<{ id: string; number: string; status: string }>(
      adminDb
        .from(tbl(schema.invoices))
        .select("id,number,status")
        .or(`id.eq.${inv.revisionOf ?? "00000000-0000-0000-0000-000000000000"},revision_of.eq.${id}`),
    ),
    can("payments.create") && inv.status !== "CANCELLED" ? payableCustomer(inv.customerId) : null,
  ]);
  const cancelled = inv.status === "CANCELLED";
  const balance = cancelled ? 0 : Math.max(0, inv.total - inv.amountPaid);
  const late = balance > 0 && inv.dueDate && inv.dueDate < todayISO();
  const revisedFrom = revisions.find((r) => r.id === inv.revisionOf);
  const revisedBy = revisions.find((r) => r.id !== inv.revisionOf);
  const event = inv.booking?.e[0];
  const active = allocations.filter((a) => !a.reversedAt);
  const sincePaid = Math.max(0, inv.amountPaid - inv.priorPayments);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/finance?tab=invoices", label: "Invoices" }}
        eyebrow={inv.booking ? `Booking ${inv.booking.number}` : "Invoice"}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {inv.number}
            <StatusBadge map={INVOICE_STATUS} value={late && inv.status !== "OVERDUE" ? "OVERDUE" : inv.status} />
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
              PDF
            </LinkButton>
            {can("invoices.update") && <InvoiceControls id={id} number={inv.number} status={inv.status} dueDate={inv.dueDate} notes={inv.notes} />}
            {payable && inv.status !== "DRAFT" && balance > 0 && inv.booking?.status !== "CANCELLED" && (
              <RecordPaymentButton customer={payable} bookingId={inv.bookingId} invoiceId={id} canAdjust={can("payments.adjust")} canAttach={can("documents.manage")} />
            )}
          </>
        }
      />
      <div className="mb-4 space-y-3">
        {late && (
          <Notice tone="danger" title="Overdue">
            {npr(balance)} was due on {fmtDate(inv.dueDate)}.
          </Notice>
        )}
        {inv.status === "DRAFT" && (
          <Notice tone="info" title="Draft">
            Not sent to the customer yet. Issue it to start collecting against it — payments already received for the booking are counted.
          </Notice>
        )}
        {cancelled && (
          <Notice tone="danger" title={`Cancelled${inv.cancelledAt ? ` ${fmtDateTime(inv.cancelledAt)}` : ""}`}>
            {inv.cancelReason ?? "No reason recorded."} Payments that were applied to it stay on the booking.
            {revisedBy && (
              <>
                {" "}
                Replaced by{" "}
                <Link href={`/admin/invoices/${revisedBy.id}`} className="font-medium underline">
                  {revisedBy.number}
                </Link>
                .
              </>
            )}
          </Notice>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
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
                ...(cancelled
                  ? []
                  : [
                      ...(inv.priorPayments ? [["Previously received (advance)", `− ${npr(inv.priorPayments)}`]] : []),
                      [inv.priorPayments ? "Paid since" : "Paid", `− ${npr(inv.priorPayments ? sincePaid : inv.amountPaid)}`],
                    ]),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt>{k}</dt>
                  <dd className="tabular-nums">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-a-border pt-1.5 text-base font-semibold">
                <dt>Amount due</dt>
                <dd className="tabular-nums">{cancelled ? "—" : npr(balance)}</dd>
              </div>
            </dl>
          </Card>
          {can("payments.view") && (
            <Card title="Payments applied" description="Advances and payments counted against this invoice, including ones received before it was created." bodyClassName="p-0">
              {allocations.length === 0 ? (
                <EmptyState compact title="No payments applied yet" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Receipt</Th>
                      <Th>Received</Th>
                      <Th>Method</Th>
                      <Th className="text-right">Applied</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a) => (
                      <tr key={a.id} className={a.reversedAt ? "text-a-muted" : undefined}>
                        <Td>
                          <Link href={`/admin/finance/payments/${a.paymentId}`} className="font-medium hover:underline">
                            {a.pay.number}
                          </Link>
                          {a.reversedAt && (
                            <span className="block text-xs">
                              Taken off {fmtDateTime(a.reversedAt)}
                              {a.reversalReason ? ` — ${a.reversalReason}` : ""}
                            </span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap">{fmtDate(a.pay.paidAt)}</Td>
                        <Td>{methodLabel(a.pay.method)}</Td>
                        <Td className={`text-right tabular-nums ${a.reversedAt ? "line-through" : ""}`}>{npr(a.amount)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {active.length > 0 && (
                <p className="border-t border-a-border px-4 py-2.5 text-right text-[13px] text-a-muted">
                  {active.length} payment{active.length === 1 ? "" : "s"} · {npr(active.reduce((s, a) => s + a.amount, 0))}
                </p>
              )}
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Details">
            <DetailList
              columns={1}
              items={[
                ["Customer", <Link key="c" href={`/admin/customers/${inv.customer.id}`} className="hover:underline">{inv.customer.name}</Link>],
                ["Booking", inv.booking ? <Link key="b" href={`/admin/bookings/${inv.booking.id}?tab=invoices`} className="hover:underline">{inv.booking.number}</Link> : null],
                ["Event", event ? <Link key="e" href={`/admin/events/${event.id}?tab=finance`} className="hover:underline">{event.title}</Link> : null],
                ["Sent", inv.sentAt ? fmtDateTime(inv.sentAt) : "Not sent"],
                ["Revised from", revisedFrom ? <Link key="r" href={`/admin/invoices/${revisedFrom.id}`} className="hover:underline">{revisedFrom.number}</Link> : null],
                ["Notes", inv.notes],
                ["Cancelled", inv.cancelledAt ? fmtDateTime(inv.cancelledAt) : null],
              ]}
            />
          </Card>
          {inv.booking && (
            <Card title="Booking balance">
              <dl className="space-y-1.5 text-[13px]">
                {[
                  ["Booking amount", inv.booking.totalAmount],
                  ["Received", inv.booking.amountPaid],
                  ["Outstanding", Math.max(0, inv.booking.totalAmount - inv.booking.amountPaid)],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between">
                    <dt>{k}</dt>
                    <dd className="tabular-nums">{npr(v as number)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
