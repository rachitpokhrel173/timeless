import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarDays, ClipboardList, FileText, PartyPopper, Wallet } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr, num, todayISO, qty } from "@/lib/format";
import { first, isUuid, listParams } from "@/lib/list";
import { BOOKING_PAY_STATUS, methodLabel, PAYMENT_TYPE_LABEL } from "@/lib/finance";
import { bookingFinance, ledger } from "@/server/finance";
import { payableCustomer } from "@/server/payables";
import { eventTypeName, eventTypeOptions } from "@/server/lookups";
import { BOOKING_STATUS, EVENT_STATUS, INVOICE_STATUS, StatusBadge } from "@/components/admin/status";
import { CreateInvoiceButton, ReceiptLink } from "@/components/admin/finance/FinanceActions";
import { RecordPaymentButton } from "@/components/admin/finance/RecordPayment";
import { LedgerStatus } from "../../finance/tabs";
import { Card, DetailList, EmptyState, LinkButton, Notice, PageHeader, ProgressBar, Table, Tabs, Td, Th } from "@/components/admin/ui";
import { amountDue } from "@/server/payment-reminders";
import { workEligibility } from "@/server/assignments";
import { BookingStatusButtons, EditMoneyButton, PaymentReminderButton } from "../BookingClient";
import { isHeld } from "@/lib/task-status";

export const metadata: Metadata = { title: "Booking" };

type Booking = Row<typeof schema.bookings> & {
  customer: { id: string; name: string; phone: string | null; email: string | null };
  quote: { id: string; number: string; status: string } | null;
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
      .select(`${cols(schema.bookings)},customer:customers!inner(id,name,phone,email),quote:quotations(id,number,status),pkg:packages(id,name),event:events(${cols(schema.events)})`)
      .eq("id", id),
  );
  if (!booking) notFound();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const event = first(booking.event);
  const tab = ["overview", "payments", "invoices"].includes(str("tab") ?? "") ? str("tab")! : "overview";

  const [items, payments, invoices, types, work, fin, payable] = await Promise.all([
    many<Row<typeof schema.bookingItems>>(adminDb.from(tbl(schema.bookingItems)).select(cols(schema.bookingItems)).eq("booking_id", id).order("position")),
    can("payments.view") ? ledger({ bookingId: id }) : [],
    can("invoices.view") ? many<Row<typeof schema.invoices>>(adminDb.from(tbl(schema.invoices)).select(cols(schema.invoices)).eq("booking_id", id).order("created_at", { ascending: false })) : [],
    eventTypeOptions(),
    event && can("events.view")
      ? many<{ id: string; status: string; dueAt: Date | null }>(adminDb.from(tbl(schema.eventTasks)).select("id,status,dueAt:due_at").eq("event_id", event.id))
      : null,
    bookingFinance(id),
    can("payments.create") ? payableCustomer(booking.customerId) : null,
  ]);
  const workOk = workEligibility({ status: booking.status, quoteStatus: booking.quote?.status ?? null, hasEvent: !!event });
  const balance = fin?.outstanding ?? Math.max(0, booking.totalAmount - booking.amountPaid);
  const depositOutstanding = booking.depositAmount > booking.amountPaid;
  const today = todayISO();
  const overdue = balance > 0 && booking.balanceDueDate && booking.balanceDueDate < today && booking.status !== "CANCELLED";
  const canPay = can("payments.create") && !!payable;
  const payProps = { customer: payable ?? undefined, bookingId: id, canAdjust: can("payments.adjust"), canAttach: can("documents.manage") };
  const active = booking.status !== "CANCELLED";
  const due = active && booking.status !== "COMPLETED" ? amountDue(booking) : null;
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
            {active && canPay && depositOutstanding && <RecordPaymentButton {...payProps} type="ADVANCE" variant="secondary" />}
            {active && canPay && <RecordPaymentButton {...payProps} />}
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

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Booking amount"
          value={npr(booking.totalAmount)}
          hint={booking.quote ? `Quotation ${booking.quote.number}${fin?.quotationTotal != null && fin.quotationTotal !== booking.totalAmount ? `: ${npr(fin.quotationTotal)}` : ""}` : "Created directly"}
          action={can("bookings.update") && active ? <EditMoneyButton id={id} values={booking} /> : undefined}
        />
        <Stat label="Invoiced" value={npr(fin?.invoiced ?? 0)} hint={fin?.invoiceCount ? `${fin.invoiceCount} invoice${fin.invoiceCount === 1 ? "" : "s"}` : "No invoice yet"} />
        <Stat
          label="Received"
          value={npr(fin?.received ?? booking.amountPaid)}
          tone="success"
          hint={fin?.refunded ? `after ${npr(fin.refunded)} refunded` : `${fin?.paymentCount ?? 0} payment${fin?.paymentCount === 1 ? "" : "s"}`}
        />
        <Stat
          label="Outstanding"
          value={npr(balance)}
          tone={balance > 0 ? "warning" : "success"}
          hint={fin?.credit ? `${npr(fin.credit)} overpaid — customer credit` : fin ? BOOKING_PAY_STATUS[fin.paymentStatus]?.label : undefined}
        />
        <Stat
          label="Advance received"
          value={npr(fin?.advanceReceived ?? 0)}
          hint={depositOutstanding ? `${npr(booking.depositAmount)} asked, due ${fmtDate(booking.depositDueDate)}` : `${npr(booking.depositAmount)} asked — covered`}
        />
      </div>
      <div className="mb-5">
        <ProgressBar value={Math.min(fin?.received ?? booking.amountPaid, booking.totalAmount)} max={booking.totalAmount} label="Amount received" tone={balance === 0 ? "success" : "accent"} />
      </div>

      <Tabs
        active={tab}
        items={[
          { key: "overview", label: "Overview", href: base },
          ...(can("payments.view") ? [{ key: "payments", label: "Payments", href: `${base}?tab=payments`, count: payments.filter((p) => p.status !== "REVERSED").length }] : []),
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
                          {qty(l.quantity)} {l.unit}
                        </Td>
                        <Td className="text-right tabular-nums">{npr(l.unitPrice)}</Td>
                        <Td className="text-right tabular-nums">{npr(l.amount)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
          <div className="space-y-4">
            {work && (
              <Card
                title="Work Management"
                description={workOk.ok ? "Decoration tasks and who is doing them." : workOk.reason}
                actions={
                  workOk.ok || work.length ? (
                    <LinkButton href={`/admin/work/${id}`} size="sm" icon={ClipboardList} variant={work.length ? "secondary" : "primary"}>
                      {work.length ? "Open" : can("events.update") ? "Assign tasks" : "View"}
                    </LinkButton>
                  ) : undefined
                }
              >
                {work.length ? (
                  <>
                    <div className="mb-1.5 flex justify-between text-[13px]">
                      <span>
                        {work.filter((t) => t.status === "COMPLETED").length} of {work.length} tasks done
                      </span>
                      <span className="text-a-muted tabular-nums">{Math.round((work.filter((t) => t.status === "COMPLETED").length / work.length) * 100)}%</span>
                    </div>
                    <ProgressBar value={work.filter((t) => t.status === "COMPLETED").length} max={work.length} label="Work progress" tone="accent" />
                    {work.some((t) => isHeld(t.status)) && <p className="mt-2 text-xs font-medium text-a-danger">{work.filter((t) => isHeld(t.status)).length} on hold or waiting</p>}
                  </>
                ) : (
                  <p className="text-[13px] text-a-muted">{workOk.ok ? "No tasks yet — break the approved décor into tasks for the team." : "Tasks open once the booking is confirmed."}</p>
                )}
              </Card>
            )}
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
          title="Payment history"
          description="Every payment for this booking, with or without an invoice. Refunds and reversals are made from the payment itself."
          bodyClassName="p-0"
          actions={
            active &&
            canPay && (
              <div className="flex flex-wrap gap-2">
                {due && balance > 0 && <PaymentReminderButton id={id} email={booking.customer.email} due={due} />}
                <RecordPaymentButton {...payProps} variant="secondary" size="sm" />
              </div>
            )
          }
        >
          {payments.length === 0 ? (
            <EmptyState compact icon={Wallet} title="No payments yet">
              Record the advance as soon as it arrives — no invoice is needed.
            </EmptyState>
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
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-a-subtle/60">
                    <Td>
                      <Link href={`/admin/finance/payments/${p.id}`} className="font-medium hover:underline">
                        {p.number}
                      </Link>
                      <span className="block text-xs text-a-muted">{PAYMENT_TYPE_LABEL[p.paymentType]}</span>
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDate(p.paidAt)}</Td>
                    <Td>{methodLabel(p.method)}</Td>
                    <Td className="text-xs">{p.reference ?? "—"}</Td>
                    <Td className="text-xs">{p.invoiceNumbers ?? "—"}</Td>
                    <Td className={`text-right tabular-nums ${p.status === "REVERSED" ? "text-a-muted line-through" : ""}`}>
                      {npr(p.amount)}
                      {p.refunded > 0 && <span className="block text-xs text-a-muted">−{npr(p.refunded)} refunded</span>}
                    </Td>
                    <Td>
                      <LedgerStatus p={p} />
                    </Td>
                    <Td className="text-right">
                      <ReceiptLink id={p.id} disabled={p.status === "REVERSED" || p.netAmount <= 0} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "invoices" && (
        <Card
          title="Invoices"
          bodyClassName="p-0"
          actions={
            active &&
            can("invoices.create") &&
            !invoices.some((i) => i.status !== "CANCELLED") && <CreateInvoiceButton bookingId={id} dueDate={booking.balanceDueDate} received={fin?.received ?? 0} total={booking.totalAmount} />
          }
        >
          {invoices.length === 0 ? (
            <EmptyState compact icon={FileText} title="No invoice yet">
              Create one when you&rsquo;re ready to bill the client — payments already received are applied to it automatically.
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
                  <Th className="text-right">Paid</Th>
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
                    <Td className="text-right tabular-nums">{i.status === "CANCELLED" ? "—" : npr(i.amountPaid)}</Td>
                    <Td className="text-right tabular-nums">{i.status === "CANCELLED" ? "—" : npr(Math.max(0, i.total - i.amountPaid))}</Td>
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
      <div className={`mt-1 font-serif text-xl font-medium sm:text-2xl tabular-nums ${tone === "warning" ? "text-a-warning" : tone === "success" ? "text-a-success" : ""}`}>{value}</div>
      {hint && <p className="mt-1 text-xs text-a-muted">{hint}</p>}
    </div>
  );
}
