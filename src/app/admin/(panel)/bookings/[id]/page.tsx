import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarDays, FileText, PartyPopper, Wallet } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr, num, todayISO } from "@/lib/format";
import { first, isUuid, listParams } from "@/lib/list";
import { balanceOf, PAYMENT_METHODS } from "@/server/finance";
import { eventTypeName, eventTypeOptions } from "@/server/lookups";
import Notes from "@/components/admin/Notes";
import { BOOKING_STATUS, EVENT_STATUS, INVOICE_STATUS, label, StatusBadge } from "@/components/admin/status";
import { Badge, Card, DetailList, EmptyState, LinkButton, Notice, PageHeader, ProgressBar, Table, Tabs, Td, Th } from "@/components/admin/ui";
import { BookingStatusButtons, EditMoneyButton, InvoiceButton, PaymentButton, VoidPaymentButton } from "../BookingClient";

export const metadata: Metadata = { title: "Booking" };

type Booking = Row<typeof schema.bookings> & {
  customer: { id: string; name: string; phone: string | null; email: string | null };
  quote: { id: string; number: string } | null;
  pkg: { id: string; name: string } | null;
  event: Row<typeof schema.events> | Row<typeof schema.events>[] | null;
};

export default async function BookingPage({ params, searchParams }: PageProps<"/admin/bookings/[id]">) {
  const user = await requirePage("bookings.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { str } = listParams(await searchParams);
  const booking = await maybe<Booking>(
    adminDb
      .from(tbl(schema.bookings))
      .select(`${cols(schema.bookings)},customer:customers!inner(id,name,phone,email),quote:quotations(id,number),pkg:packages(id,name),event:events(${cols(schema.events)})`)
      .eq("id", id),
  );
  if (!booking) notFound();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const event = first(booking.event);
  const tab = ["overview", "payments", "invoices"].includes(str("tab") ?? "") ? str("tab")! : "overview";

  const [items, payments, invoices, types] = await Promise.all([
    many<Row<typeof schema.bookingItems>>(adminDb.from(tbl(schema.bookingItems)).select(cols(schema.bookingItems)).eq("booking_id", id).order("position")),
    can("payments.view")
      ? many<Row<typeof schema.payments> & { inv: { number: string } | null }>(
          adminDb.from(tbl(schema.payments)).select(`${cols(schema.payments)},inv:invoices(number)`).eq("booking_id", id).order("paid_at", { ascending: false }),
        )
      : [],
    can("invoices.view") ? many<Row<typeof schema.invoices>>(adminDb.from(tbl(schema.invoices)).select(cols(schema.invoices)).eq("booking_id", id).order("created_at", { ascending: false })) : [],
    eventTypeOptions(),
  ]);
  const balance = balanceOf(booking);
  const depositOutstanding = booking.depositAmount > booking.amountPaid;
  const today = todayISO();
  const overdue = balance > 0 && booking.balanceDueDate && booking.balanceDueDate < today && booking.status !== "CANCELLED";
  const openInvoices = invoices.filter((i) => !["CANCELLED", "PAID", "DRAFT"].includes(i.status)).map((i) => ({ value: i.id, label: `${i.number} · ${npr(i.total - i.amountPaid)} due` }));
  const methods = PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }));
  const active = booking.status !== "CANCELLED";
  const base = `/admin/bookings/${id}`;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/bookings", label: "Bookings" }}
        eyebrow={booking.number}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {event?.title ?? booking.number}
            <StatusBadge map={BOOKING_STATUS} value={booking.status} />
          </span>
        }
        description={
          <>
            <Link href={`/admin/customers/${booking.customer.id}`} className="font-medium text-a-text hover:underline">
              {booking.customer.name}
            </Link>
            {event && ` · ${fmtDate(event.eventDate)}${event.venue ? ` · ${event.venue}` : ""}`}
          </>
        }
        actions={
          <>
            {event && (
              <LinkButton href={`/admin/events/${event.id}`} icon={PartyPopper}>
                Event workspace
              </LinkButton>
            )}
            {active && can("payments.create") && balance > 0 && <PaymentButton bookingId={id} balance={balance} invoices={openInvoices} hasEmail={!!booking.customer.email} methods={methods} />}
            <BookingStatusButtons id={id} status={booking.status} canUpdate={can("bookings.update")} canCancel={can("bookings.cancel")} hasEmail={!!booking.customer.email} />
          </>
        }
      />

      <div className="mb-4 space-y-3">
        {booking.status === "PENDING" && depositOutstanding && (
          <Notice tone="warning" title="Awaiting advance">
            {npr(booking.depositAmount - booking.amountPaid)} more confirms this booking{booking.depositDueDate ? ` (due ${fmtDate(booking.depositDueDate)})` : ""}. Recording it confirms the booking automatically.
          </Notice>
        )}
        {overdue && (
          <Notice tone="danger" title="Balance overdue">
            {npr(balance)} was due on {fmtDate(booking.balanceDueDate)}.
          </Notice>
        )}
        {booking.status === "CANCELLED" && (
          <Notice tone="danger" title={`Cancelled ${fmtDateTime(booking.cancelledAt)}`}>
            {booking.cancelReason ?? "No reason recorded."}
          </Notice>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Contract value" value={npr(booking.totalAmount)} action={can("bookings.update") && active ? <EditMoneyButton id={id} values={booking} /> : undefined} />
        <Stat label="Paid" value={npr(booking.amountPaid)} />
        <Stat label="Balance" value={npr(balance)} tone={balance > 0 ? "warning" : "success"} />
        <Stat label="Advance" value={npr(booking.depositAmount)} hint={depositOutstanding ? `due ${fmtDate(booking.depositDueDate)}` : "covered"} />
      </div>
      <div className="mb-5">
        <ProgressBar value={booking.amountPaid} max={booking.totalAmount} label="Amount paid" tone={balance === 0 ? "success" : "accent"} />
      </div>

      <Tabs
        active={tab}
        items={[
          { key: "overview", label: "Overview", href: base },
          ...(can("payments.view") ? [{ key: "payments", label: "Payments", href: `${base}?tab=payments`, count: payments.filter((p) => !p.voidedAt).length }] : []),
          ...(can("invoices.view") ? [{ key: "invoices", label: "Invoices", href: `${base}?tab=invoices`, count: invoices.length }] : []),
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Card title="Booked items" description={items.length ? "Copied from the accepted quotation — the basis for invoices." : undefined} bodyClassName="p-0">
              {items.length === 0 ? (
                <EmptyState compact title="No itemised lines">
                  This booking is billed at its contract value.
                </EmptyState>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Item</Th>
                      <Th className="text-right">Qty</Th>
                      <Th className="text-right">Rate</Th>
                      <Th className="text-right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((l) => (
                      <tr key={l.id}>
                        <Td>{l.description}</Td>
                        <Td className="text-right tabular-nums">
                          {num(l.quantity)} {l.unit}
                        </Td>
                        <Td className="text-right tabular-nums">{npr(l.unitPrice)}</Td>
                        <Td className="text-right tabular-nums">{npr(l.amount)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
            <Notes entityType="booking" entityId={id} canEdit={can("bookings.update")} />
          </div>
          <div className="space-y-4">
            <Card title="Event" actions={event && <StatusBadge map={EVENT_STATUS} value={event.status} />}>
              {event ? (
                <DetailList
                  columns={1}
                  items={[
                    ["Type", eventTypeName(types, event.eventType)],
                    ["Date", <span key="d" className="inline-flex items-center gap-1"><CalendarDays className="size-3.5 text-a-muted" aria-hidden /> {fmtDate(event.eventDate)}{event.startTime ? ` · ${event.startTime.slice(0, 5)}` : ""}</span>],
                    ["Venue", event.venue],
                    ["Guests", event.guestCount ? num(event.guestCount) : null],
                  ]}
                />
              ) : (
                <p className="text-[13px] text-a-muted">No event workspace.</p>
              )}
            </Card>
            <Card title="Details">
              <DetailList
                columns={1}
                items={[
                  ["Customer", <Link key="c" href={`/admin/customers/${booking.customer.id}`} className="hover:underline">{booking.customer.name}</Link>],
                  ["Phone", booking.customer.phone],
                  ["Quotation", booking.quote ? <Link href={`/admin/quotations/${booking.quote.id}`} className="hover:underline">{booking.quote.number}</Link> : "Created directly"],
                  ["Package", booking.pkg ? <Link href={`/admin/packages/${booking.pkg.id}`} className="hover:underline">{booking.pkg.name}</Link> : null],
                  ["Balance due", fmtDate(booking.balanceDueDate)],
                  ["Created", fmtDateTime(booking.createdAt)],
                  ["Confirmed", booking.confirmedAt ? fmtDateTime(booking.confirmedAt) : null],
                ]}
              />
            </Card>
          </div>
        </div>
      )}

      {tab === "payments" && (
        <Card
          title="Payments"
          bodyClassName="p-0"
          actions={active && can("payments.create") && balance > 0 && <PaymentButton bookingId={id} balance={balance} invoices={openInvoices} hasEmail={!!booking.customer.email} methods={methods} variant="secondary" />}
        >
          {payments.length === 0 ? (
            <EmptyState compact icon={Wallet} title="No payments yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Receipt</Th>
                  <Th>Date</Th>
                  <Th>Method</Th>
                  <Th>Reference</Th>
                  <Th>Invoice</Th>
                  <Th className="text-right">Amount</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className={p.voidedAt ? "text-a-muted line-through" : undefined}>
                    <Td className="font-medium">{p.number}</Td>
                    <Td>{fmtDate(p.paidAt)}</Td>
                    <Td>{label(p.method)}</Td>
                    <Td>{p.reference ?? "—"}</Td>
                    <Td>{p.inv?.number ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{npr(p.amount)}</Td>
                    <Td className="text-right no-underline">
                      {p.voidedAt ? <Badge tone="danger">Void</Badge> : can("payments.create") && <VoidPaymentButton id={p.id} number={p.number} />}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "invoices" && (
        <Card title="Invoices" bodyClassName="p-0" actions={active && can("invoices.create") && !invoices.some((i) => i.status !== "CANCELLED") && <InvoiceButton bookingId={id} dueDate={booking.balanceDueDate} />}>
          {invoices.length === 0 ? (
            <EmptyState compact icon={FileText} title="No invoice yet">
              Create one when you're ready to bill the client.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Issued</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      <Link href={`/admin/invoices/${i.id}`} className="font-medium hover:underline">
                        {i.number}
                      </Link>
                    </Td>
                    <Td>{fmtDate(i.issueDate)}</Td>
                    <Td>{fmtDate(i.dueDate)}</Td>
                    <Td>
                      <StatusBadge map={INVOICE_STATUS} value={i.status} />
                    </Td>
                    <Td className="text-right tabular-nums">{npr(i.total)}</Td>
                    <Td className="text-right tabular-nums">{npr(Math.max(0, i.total - i.amountPaid))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

function Stat({ label, value, hint, tone, action }: { label: string; value: string; hint?: string; tone?: "warning" | "success"; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex items-center justify-between gap-2 text-[13px] text-a-muted">
        {label}
        {action}
      </div>
      <div className={`mt-1 font-serif text-2xl font-medium tabular-nums ${tone === "warning" ? "text-a-warning" : tone === "success" ? "text-a-success" : ""}`}>{value}</div>
      {hint && <p className="mt-1 text-xs text-a-muted">{hint}</p>}
    </div>
  );
}
