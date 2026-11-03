import type { Metadata } from "next";
import Link from "@/components/admin/Link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { adminDb, many, maybe, schema, tbl } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { methodLabel, PAYMENT_TYPE_LABEL } from "@/lib/finance";
import { fmtDate, fmtDateTime, npr } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { adjustmentsFor, allocatableInvoices, allocationsFor, ledger } from "@/server/finance";
import { AllocateButton, AssignBookingButton, EmailReceiptButton, RefundButton, ReleaseAllocationButton, ReversePaymentButton } from "@/components/admin/finance/FinanceActions";
import { Card, DetailList, EmptyState, LinkButton, Notice, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { LedgerStatus } from "../../tabs";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentPage({ params }: PageProps<"/admin/finance/payments/[id]">) {
  const user = await requirePage("payments.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [p] = await ledger({ paymentId: id });
  if (!p) notFound();
  const can = (x: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(x);
  const [allocations, adjustments, customer, invoices, bookings, recorder] = await Promise.all([
    allocationsFor({ paymentIds: [id] }),
    adjustmentsFor([id]),
    maybe<{ email: string | null; phone: string | null }>(adminDb.from(tbl(schema.customers)).select("email,phone").eq("id", p.customerId)),
    p.status !== "REVERSED" && p.unallocated > 0 ? allocatableInvoices(p) : [],
    !p.bookingId && p.status !== "REVERSED"
      ? many<{ id: string; number: string; e: { title: string }[] }>(adminDb.from(tbl(schema.bookings)).select("id,number,e:events(title)").eq("customer_id", p.customerId).neq("status", "CANCELLED").order("created_at", { ascending: false }))
      : [],
    maybe<{ voidedBy: { fullName: string } | null }>(adminDb.from(tbl(schema.payments)).select("voidedBy:profiles!payments_voided_by_profiles_id_fk(fullName:full_name)").eq("id", id)),
  ]);
  const reversed = p.status === "REVERSED";
  const refundable = reversed ? 0 : p.amount - p.refunded;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/finance?tab=payments", label: "Payments" }}
        eyebrow={`${PAYMENT_TYPE_LABEL[p.paymentType]} · ${fmtDate(p.paidAt)}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {p.number}
            <LedgerStatus p={p} />
          </span>
        }
        description={
          <>
            <Link href={`/admin/customers/${p.customerId}`} className="font-medium text-a-text hover:underline">
              {p.customerName}
            </Link>{" "}
            · {npr(p.amount)} by {methodLabel(p.method)}
          </>
        }
        actions={
          <>
            {!reversed && p.netAmount > 0 && (
              <LinkButton href={`/admin/print/receipt/${id}`} target="_blank" icon={Printer}>
                Receipt
              </LinkButton>
            )}
            {!reversed && p.netAmount > 0 && can("payments.create") && <EmailReceiptButton id={id} email={customer?.email ?? null} />}
            {can("payments.create") && <AllocateButton paymentId={id} unallocated={p.unallocated} invoices={invoices.map((i) => ({ id: i.id, number: i.number, due: i.total - i.amountPaid }))} size="md" />}
            {can("payments.create") && <AssignBookingButton paymentId={id} bookings={bookings.map((b) => ({ value: b.id, label: `${b.number}${b.e[0] ? ` — ${b.e[0].title}` : ""}` }))} />}
            {can("payments.adjust") && !reversed && <RefundButton id={id} number={p.number} refundable={refundable} />}
            {can("payments.adjust") && !reversed && p.refunded === 0 && <ReversePaymentButton id={id} number={p.number} />}
          </>
        }
      />

      <div className="mb-4 space-y-3">
        {reversed && (
          <Notice tone="danger" title={`Reversed ${p.voidedAt ? fmtDateTime(p.voidedAt) : ""}${recorder?.voidedBy ? ` by ${recorder.voidedBy.fullName}` : ""}`}>
            {p.voidReason ?? "No reason recorded."} It no longer counts as money received.
          </Notice>
        )}
        {!reversed && !p.bookingId && (
          <Notice tone="warning" title="Not assigned to a booking">
            Held as {p.customerName}&apos;s credit. Assign it to the booking it&apos;s for.
          </Notice>
        )}
        {!reversed && p.bookingId && p.unallocated > 0 && invoices.length > 0 && (
          <Notice tone="info" title={`${npr(p.unallocated)} not on an invoice yet`}>
            Apply it to an open invoice of this booking.
          </Notice>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="Applied to invoices" bodyClassName="p-0">
            {allocations.length === 0 ? (
              <EmptyState compact title={p.bookingId ? "Not on an invoice — counted on the booking" : "Not on an invoice"} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Applied</Th>
                    <Th className="text-right">Amount</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a) => (
                    <tr key={a.id} className={a.reversedAt ? "text-a-muted" : undefined}>
                      <Td>
                        <Link href={`/admin/invoices/${a.invoiceId}`} className="font-medium hover:underline">
                          {a.inv.number}
                        </Link>
                        {a.reversedAt && (
                          <span className="block text-xs">
                            Taken off {fmtDateTime(a.reversedAt)} — {a.reversalReason}
                          </span>
                        )}
                      </Td>
                      <Td className="text-xs">{fmtDateTime(a.createdAt)}</Td>
                      <Td className={`text-right tabular-nums ${a.reversedAt ? "line-through" : ""}`}>{npr(a.amount)}</Td>
                      <Td className="text-right">{!a.reversedAt && can("payments.adjust") && <ReleaseAllocationButton allocationId={a.id} label={a.inv.number} />}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card title="Refunds & reversals" bodyClassName="p-0">
            {adjustments.length === 0 ? (
              <EmptyState compact title="None" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Number</Th>
                    <Th>Date</Th>
                    <Th>Reason</Th>
                    <Th>By</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((a) => (
                    <tr key={a.id}>
                      <Td>
                        <span className="font-medium">{a.number}</span>
                        <span className="block text-xs text-a-muted">
                          {a.kind === "REFUND" ? `Refund${a.method ? ` · ${methodLabel(a.method)}` : ""}` : "Reversal"}
                          {a.reference ? ` · ${a.reference}` : ""}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap">{fmtDate(a.adjustedOn)}</Td>
                      <Td className="max-w-72 text-xs">{a.reason}</Td>
                      <Td className="text-xs">
                        {a.by?.fullName ?? "—"}
                        <span className="block text-a-muted">{fmtDateTime(a.createdAt)}</span>
                      </Td>
                      <Td className="text-right tabular-nums">−{npr(a.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Amounts">
            <dl className="space-y-1.5 text-[13px]">
              {[
                ["Amount received", p.amount],
                ...(p.refunded ? [["Refunded", -p.refunded]] : []),
                ["Counts as received", p.netAmount],
                ["Applied to invoices", p.allocated],
                ["Not on an invoice", p.unallocated],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <dt>{k}</dt>
                  <dd className="tabular-nums">{npr(v as number)}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Details">
            <DetailList
              columns={1}
              items={[
                ["Customer", <Link key="c" href={`/admin/customers/${p.customerId}`} className="hover:underline">{p.customerName}</Link>],
                ["Booking", p.bookingId ? <Link key="b" href={`/admin/bookings/${p.bookingId}?tab=payments`} className="hover:underline">{p.bookingNumber}</Link> : "Not assigned"],
                ["Event", p.eventId ? <Link key="e" href={`/admin/events/${p.eventId}?tab=finance`} className="hover:underline">{p.eventTitle}</Link> : null],
                ["Date received", fmtDate(p.paidAt)],
                ["Method", methodLabel(p.method)],
                ["Transaction ref.", p.reference],
                ["Received by", p.receivedBy],
                ["Recorded by", p.recordedByName],
                ["Recorded at", fmtDateTime(p.createdAt)],
                ["Notes", p.notes],
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
