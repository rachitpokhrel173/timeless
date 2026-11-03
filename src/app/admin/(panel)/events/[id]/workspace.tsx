import Link from "next/link";
import { CheckCircle2, ClipboardList, FileText, Receipt } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { fmtDate, fmtDateTime, npr, num } from "@/lib/format";
import { signedUrl } from "@/server/storage";
import { BOOKING_PAY_STATUS, methodLabel, PAYMENT_STATE, PAYMENT_TYPE_LABEL } from "@/lib/finance";
import { bookingFinance, ledger } from "@/server/finance";
import { payableCustomer } from "@/server/payables";
import { CreateInvoiceButton, ReceiptLink } from "@/components/admin/finance/FinanceActions";
import { RecordPaymentButton } from "@/components/admin/finance/RecordPayment";
import { DESIGN_STATUS, INQUIRY_STATUS, INVOICE_STATUS, PRIORITY, QUOTE_STATUS, SERVICE_STATUS, StatusBadge, TASK_STATUS, WORK_ORDER_STATUS, label } from "@/components/admin/status";
import { Badge, Card, DetailList, EmptyState, Table, Td, Th } from "@/components/admin/ui";
import {
  CompleteEventButton,
  CreateWorkOrdersButton,
  DeleteWorkOrderButton,
  ServiceButton,
  WorkOrderButton,
  WorkOrderNoteButton,
  WorkOrderStatusSelect,
  WorkOrderTaskButton,
} from "../WorkspaceClient";

/*
 * Event workspace tabs (Phase 1). Everything is read from the records themselves — the inquiry,
 * quotation, booking, work orders, tasks, inventory, payments — so nothing is copied or typed twice.
 */

type Opt = { value: string; label: string };

/* ───────── Shared lookups ───────── */

export async function bookingContext(bookingId: string | null) {
  if (!bookingId) return null;
  return maybe<{ id: string; number: string; quotationId: string | null; inquiryId: string | null; leadId: string | null; totalAmount: number; amountPaid: number; status: string }>(
    adminDb
      .from(tbl(schema.bookings))
      .select("id,number,quotationId:quotation_id,inquiryId:inquiry_id,leadId:lead_id,totalAmount:total_amount,amountPaid:amount_paid,status")
      .eq("id", bookingId),
  );
}

export const serviceOptions = async (bookingId: string | null): Promise<Opt[]> =>
  bookingId ? many<Opt>(adminDb.from(tbl(schema.bookingItems)).select("value:id,label:description").eq("booking_id", bookingId).neq("status", "CANCELLED").order("position")) : [];

/** What still stands between the event and being closed (same checks as complete_event). */
export async function completionBlockers(eventId: string, bookingStatus: string | null) {
  const [orders, tasks, header] = await Promise.all([
    many<{ id: string }>(adminDb.from(tbl(schema.workOrders)).select("id").eq("event_id", eventId).not("status", "in", "(DONE,CANCELLED)")),
    many<{ id: string }>(adminDb.from(tbl(schema.eventTasks)).select("id").eq("event_id", eventId).not("status", "in", "(COMPLETED,CANCELLED)")),
    maybe<{ id: string }>(adminDb.from(tbl(schema.inventoryReservations)).select("id").eq("event_id", eventId)),
  ]);
  const lines = header ? await many<{ id: string }>(adminDb.from(tbl(schema.inventoryReservationItems)).select("id").eq("reservation_id", header.id).in("status", ["RESERVED", "CHECKED_OUT"]).gt("quantity", 0)) : [];
  const out: string[] = [];
  if (bookingStatus === "PENDING") out.push("Confirm the booking (the advance hasn't been confirmed)");
  if (orders.length) out.push(`${orders.length} work order${orders.length === 1 ? "" : "s"} still open`);
  if (tasks.length) out.push(`${tasks.length} task${tasks.length === 1 ? "" : "s"} still open`);
  if (lines.length) out.push(`Record what came back for ${lines.length} inventory line${lines.length === 1 ? "" : "s"}`);
  return out;
}

/* ───────── Completion card (overview) ───────── */

export async function CompletionCard({
  event,
  bookingStatus,
  balance,
  canComplete,
}: {
  event: { id: string; status: string; completedAt: Date | null; completionNotes: string | null; by?: string | null };
  bookingStatus: string | null;
  balance: number;
  canComplete: boolean;
}) {
  if (event.status === "CANCELLED") return null;
  if (event.status === "COMPLETED")
    return (
      <Card title="Completed">
        <p className="flex items-center gap-2 text-[13px]">
          <CheckCircle2 className="size-4 text-a-success" aria-hidden />
          {event.completedAt ? `Closed ${fmtDateTime(event.completedAt)}` : "Closed"}
          {event.by ? ` by ${event.by}` : ""}
        </p>
        {event.completionNotes && <p className="mt-2 whitespace-pre-line text-[13px] text-a-muted">{event.completionNotes}</p>}
        {balance > 0 && <p className="mt-2 text-[13px] font-medium text-a-warning">Balance still due: {npr(balance)}</p>}
      </Card>
    );
  const blockers = await completionBlockers(event.id, bookingStatus);
  return (
    <Card title="Completion" description={blockers.length ? "Still to do before the event can be closed:" : "Everything is finished — ready to close."}>
      {blockers.length > 0 && (
        <ul className="mb-3 list-disc space-y-1 pl-5 text-[13px]">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {canComplete && <CompleteEventButton eventId={event.id} blockers={blockers} balance={balance} />}
    </Card>
  );
}

/* ───────── Requirements ───────── */

export async function RequirementsTab({ event, inquiryId }: { event: Row<typeof schema.events>; inquiryId: string | null }) {
  const inquiry = inquiryId ? await maybe<Row<typeof schema.inquiries>>(adminDb.from(tbl(schema.inquiries)).select(cols(schema.inquiries)).eq("id", inquiryId)) : null;
  const attachments = inquiry ? await Promise.all(inquiry.attachments.map(async (path) => ({ path, url: await signedUrl("private-documents", path, 600).catch(() => null) }))) : [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Confirmed for the event" description="What was agreed — edit it with “Edit details”.">
        <DetailList
          columns={1}
          items={[
            ["Theme", event.theme],
            ["Style", event.style],
            ["Colour theme", event.colorTheme],
            ["Requirements", event.requirements ? <span key="r" className="whitespace-pre-line">{event.requirements}</span> : null],
            ["Special instructions", event.specialInstructions ? <span key="s" className="whitespace-pre-line">{event.specialInstructions}</span> : null],
          ]}
        />
      </Card>
      <Card
        title="Original inquiry"
        description="Exactly what the client asked for. Kept unchanged for reference."
        actions={inquiry && <Link href={`/admin/inquiries/${inquiry.id}`} className="text-[13px] hover:underline">{inquiry.number}</Link>}
      >
        {!inquiry ? (
          <p className="text-[13px] text-a-muted">This event isn&rsquo;t linked to an inquiry (it was booked directly).</p>
        ) : (
          <>
            <DetailList
              columns={1}
              items={[
                ["Received", fmtDateTime(inquiry.createdAt)],
                ["Status", <StatusBadge key="s" map={INQUIRY_STATUS} value={inquiry.status} />],
                ["Event type", inquiry.eventType],
                ["Date asked for", inquiry.eventDate ? fmtDate(inquiry.eventDate) : null],
                ["Venue", inquiry.venue],
                ["Guests", inquiry.guestCount],
                ["Budget", inquiry.budget],
                ["Theme", inquiry.theme],
                ["Services", inquiry.services.length ? inquiry.services.join(", ") : null],
                ["Designs liked", inquiry.designs.length ? inquiry.designs.join(", ") : null],
              ]}
            />
            {inquiry.message && <p className="mt-3 whitespace-pre-line rounded-md bg-a-subtle p-3 text-[13px]">{inquiry.message}</p>}
            {(inquiry.inspirationLinks.length > 0 || attachments.length > 0) && (
              <ul className="mt-3 space-y-1 text-[13px]">
                {inquiry.inspirationLinks.map((l) => (
                  <li key={l}>
                    <a href={l} target="_blank" rel="noreferrer noopener" className="break-all hover:underline">
                      {l}
                    </a>
                  </li>
                ))}
                {attachments.map((a) => (
                  <li key={a.path}>{a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">{a.path.split("/").pop()}</a> : a.path.split("/").pop()}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/* ───────── Services ───────── */

export async function ServicesTab({ bookingId, canEdit, money }: { bookingId: string | null; canEdit: boolean; money: boolean }) {
  if (!bookingId) return <EmptyState title="No booking">Services come from the booking. This event was created without one.</EmptyState>;
  const items = await many<Row<typeof schema.bookingItems> & { wo: { id: string; status: string }[] }>(
    adminDb.from(tbl(schema.bookingItems)).select(`${cols(schema.bookingItems)},wo:work_orders(id,status)`).eq("booking_id", bookingId).order("position"),
  );
  if (!items.length) return <EmptyState title="No services on the booking" />;
  return (
    <Card title="Confirmed services" description="The booked lines, traceable to the accepted quotation. Price and quantity are the contract; track delivery here." bodyClassName="p-0">
      <Table>
        <thead>
          <tr>
            <Th>Service</Th>
            <Th className="text-right">Qty</Th>
            {money && <Th className="text-right">Amount</Th>}
            <Th>Status</Th>
            <Th>Work orders</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {items.map(({ wo, ...it }) => (
            <tr key={it.id}>
              <Td>
                <span className="font-medium">{it.description}</span>
                {it.details && <span className="block whitespace-pre-line text-xs text-a-muted">{it.details}</span>}
                {it.specifications && <span className="mt-1 block whitespace-pre-line text-xs">Specs: {it.specifications}</span>}
                {!it.quotationItemId && <span className="block text-xs text-a-muted">Added on the booking</span>}
              </Td>
              <Td className="text-right tabular-nums">
                {num(Number(it.quantity))} {it.unit ?? ""}
              </Td>
              {money && <Td className="text-right tabular-nums">{npr(it.amount)}</Td>}
              <Td>
                <StatusBadge map={SERVICE_STATUS} value={it.status} />
              </Td>
              <Td className="text-xs">{wo.length ? `${wo.filter((w) => w.status === "DONE").length}/${wo.filter((w) => w.status !== "CANCELLED").length} done` : "—"}</Td>
              <Td className="text-right">{canEdit && <ServiceButton id={it.id} description={it.description} status={it.status} specifications={it.specifications} />}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/* ───────── Work orders ───────── */

export async function WorkOrdersTab({ eventId, bookingId, plan, canStatus, staff }: { eventId: string; bookingId: string | null; plan: boolean; canStatus: boolean; staff: Opt[] }) {
  const [orders, services, designs] = await Promise.all([
    many<
      Row<typeof schema.workOrders> & {
        s: { name: string } | null;
        bi: { description: string } | null;
        d: { title: string; version: number } | null;
        t: { id: string; title: string; status: string }[];
        u: { id: string; body: string | null; fromStatus: string | null; toStatus: string | null; createdAt: string; p: { fullName: string } | null }[];
      }
    >(
      adminDb
        .from(tbl(schema.workOrders))
        .select(
          `${cols(schema.workOrders)},s:staff(name),bi:booking_items(description),d:design_approvals(title,version),t:event_tasks(id,title,status),u:work_order_updates(id,body,fromStatus:from_status,toStatus:to_status,createdAt:created_at,p:profiles(fullName:full_name))`,
        )
        .eq("event_id", eventId)
        .order("position")
        .order("created_at"),
    ),
    serviceOptions(bookingId),
    many<Opt>(adminDb.from(tbl(schema.designApprovals)).select("value:id,label:title").eq("event_id", eventId).eq("status", "APPROVED").order("title")),
  ]);
  const active = orders.filter((o) => o.status !== "CANCELLED");
  return (
    <div className="space-y-4">
      {plan && (
        <div className="flex flex-wrap gap-2">
          {bookingId && <CreateWorkOrdersButton eventId={eventId} />}
          <WorkOrderButton eventId={eventId} services={services} designs={designs} staff={staff} />
        </div>
      )}
      {orders.length === 0 && (
        <EmptyState icon={ClipboardList} title="No work orders yet">
          A work order is one piece of production — the stage, the entrance, the flowers. Create them from the confirmed services, then add tasks for the team.
        </EmptyState>
      )}
      {active.length > 0 && (
        <p className="text-[13px] text-a-muted">
          {active.filter((o) => o.status === "DONE").length} of {active.length} done
        </p>
      )}
      {orders.map(({ s, bi, d, t, u, ...o }) => (
        <Card
          key={o.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {o.title}
              {o.priority !== "MEDIUM" && <StatusBadge map={PRIORITY} value={o.priority} />}
            </span>
          }
          description={[bi?.description && `Service: ${bi.description}`, o.teamRole, s?.name && `Lead: ${s.name}`, o.startDate && `from ${fmtDate(o.startDate)}`, o.dueAt && `due ${fmtDateTime(o.dueAt)}`].filter(Boolean).join(" · ") || undefined}
          actions={
            <span className="flex items-center gap-1">
              {canStatus ? <WorkOrderStatusSelect id={o.id} status={o.status} /> : <StatusBadge map={WORK_ORDER_STATUS} value={o.status} />}
              {plan && (
                <>
                  <WorkOrderTaskButton workOrderId={o.id} staff={staff} />
                  <WorkOrderNoteButton workOrderId={o.id} />
                  <WorkOrderButton eventId={eventId} values={o} services={services} designs={designs} staff={staff} />
                  <DeleteWorkOrderButton id={o.id} title={o.title} />
                </>
              )}
            </span>
          }
        >
          <div className="grid gap-3 text-[13px] sm:grid-cols-2">
            {o.description && <p className="whitespace-pre-line sm:col-span-2">{o.description}</p>}
            {o.instructions && (
              <div>
                <p className="text-xs font-medium text-a-muted uppercase">Instructions</p>
                <p className="whitespace-pre-line">{o.instructions}</p>
              </div>
            )}
            {o.requiredMaterials && (
              <div>
                <p className="text-xs font-medium text-a-muted uppercase">Materials</p>
                <p className="whitespace-pre-line">{o.requiredMaterials}</p>
              </div>
            )}
            {d && (
              <p>
                Design: {d.title} <Badge icon={false}>v{d.version}</Badge>
              </p>
            )}
          </div>
          {t.length > 0 && (
            <ul className="mt-3 divide-y divide-a-border rounded-md border border-a-border">
              {t.map((task) => (
                <li key={task.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <Link href={`/admin/my-work/${task.id}`} className="flex-1 hover:underline">
                    {task.title}
                  </Link>
                  <StatusBadge map={TASK_STATUS} value={task.status} />
                </li>
              ))}
            </ul>
          )}
          {u.length > 0 && (
            <details className="mt-3 text-xs text-a-muted">
              <summary className="cursor-pointer">History ({u.length})</summary>
              <ul className="mt-2 space-y-1">
                {[...u]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((h) => (
                    <li key={h.id}>
                      {fmtDateTime(h.createdAt)} · {h.p?.fullName ?? "System"}
                      {h.toStatus && ` → ${WORK_ORDER_STATUS[h.toStatus]?.label ?? h.toStatus}`}
                      {h.body && ` — ${h.body}`}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ───────── Activity (timeline of what happened) ───────── */

type Entry = { at: string; text: string; who?: string | null; tone?: "success" | "danger" | "info" };

export async function ActivityFeed({ eventId, booking }: { eventId: string; booking: Awaited<ReturnType<typeof bookingContext>> }) {
  const [logs, designs, payments, quoteActs, inquiry, bookingRow] = await Promise.all([
    many<{ createdAt: string; summary: string; userName: string | null }>(
      adminDb
        .from(tbl(schema.activityLogs))
        .select("createdAt:created_at,summary,userName:user_name")
        .or(`and(entity.eq.event,entity_id.eq.${eventId}),metadata->>eventId.eq.${eventId}`)
        .order("created_at", { ascending: false })
        .limit(150),
    ),
    many<{ createdAt: string; toStatus: string; note: string | null; d: { title: string } | null; p: { fullName: string } | null }>(
      adminDb.from(tbl(schema.designApprovalHistory)).select("createdAt:created_at,toStatus:to_status,note,d:design_approvals(title),p:profiles(fullName:full_name)").eq("event_id", eventId),
    ),
    booking ? many<{ paidAt: string; amount: number; number: string; voidedAt: string | null }>(adminDb.from(tbl(schema.payments)).select("paidAt:paid_at,amount,number,voidedAt:voided_at").eq("booking_id", booking.id)) : [],
    booking?.quotationId ? many<{ createdAt: string; action: string; name: string | null }>(adminDb.from(tbl(schema.quotationActivity)).select("createdAt:created_at,action,name").eq("quotation_id", booking.quotationId)) : [],
    booking?.inquiryId ? maybe<{ createdAt: string; number: string; name: string }>(adminDb.from(tbl(schema.inquiries)).select("createdAt:created_at,number,name").eq("id", booking.inquiryId)) : null,
    booking ? maybe<{ createdAt: string; confirmedAt: string | null; completedAt: string | null }>(adminDb.from(tbl(schema.bookings)).select("createdAt:created_at,confirmedAt:confirmed_at,completedAt:completed_at").eq("id", booking.id)) : null,
  ]);
  const entries: Entry[] = [
    ...logs.map((l) => ({ at: l.createdAt, text: l.summary, who: l.userName })),
    ...designs.map((d) => ({ at: d.createdAt, text: `Design “${d.d?.title ?? ""}” → ${DESIGN_STATUS[d.toStatus]?.label ?? d.toStatus}${d.note ? ` — “${d.note}”` : ""}`, who: d.p?.fullName, tone: d.toStatus === "APPROVED" ? ("success" as const) : undefined })),
    ...payments.map((p) => ({ at: `${p.paidAt}T12:00:00+05:45`, text: `Payment ${p.number}: ${npr(p.amount)}${p.voidedAt ? " (voided)" : ""}`, tone: p.voidedAt ? ("danger" as const) : ("success" as const) })),
    ...quoteActs.map((q) => ({ at: q.createdAt, text: `Quotation ${label(q.action).toLowerCase()}`, who: q.name })),
  ];
  if (inquiry) entries.push({ at: inquiry.createdAt, text: `Inquiry ${inquiry.number} received from ${inquiry.name}`, tone: "info" });
  if (bookingRow && booking) {
    entries.push({ at: bookingRow.createdAt, text: `Booking ${booking.number} created`, tone: "info" });
    if (bookingRow.confirmedAt) entries.push({ at: bookingRow.confirmedAt, text: `Booking ${booking.number} confirmed`, tone: "success" });
  }
  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return (
    <Card title="Activity" description="Everything that happened, from the first inquiry to completion. Read-only — taken from the records themselves." bodyClassName="p-0">
      {entries.length === 0 ? (
        <EmptyState compact title="No activity yet" />
      ) : (
        <ol className="divide-y divide-a-border">
          {entries.slice(0, 200).map((e, i) => (
            <li key={i} className="flex gap-3 px-4 py-2.5 text-[13px]">
              <span className="w-32 shrink-0 text-xs text-a-muted tabular-nums">{fmtDateTime(e.at)}</span>
              <span className={`min-w-0 flex-1 ${e.tone === "danger" ? "text-a-danger" : e.tone === "success" ? "text-a-success" : ""}`}>
                {e.text}
                {e.who && <span className="text-a-muted"> · {e.who}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ───────── Finance ───────── */

type FinancePerms = { payments: boolean; record: boolean; adjust: boolean; attach: boolean; invoices: boolean; createInvoice: boolean; expenses: boolean };

/**
 * Event finance = its booking's finance (payments and invoices belong to the booking), plus the
 * expenses recorded against the event. Figures come from the shared booking_finance view.
 */
export async function FinanceTab({ booking, eventId, customerId, can }: { booking: Awaited<ReturnType<typeof bookingContext>>; eventId: string; customerId: string | null; can: FinancePerms }) {
  const [fin, payments, invoices, quote, payable, expenses] = await Promise.all([
    booking ? bookingFinance(booking.id) : null,
    booking && can.payments ? ledger({ bookingId: booking.id }) : [],
    booking && (can.invoices || can.payments)
      ? many<{ id: string; number: string; total: number; amountPaid: number; priorPayments: number; status: string; dueDate: string | null }>(
          adminDb.from(tbl(schema.invoices)).select("id,number,total,amountPaid:amount_paid,priorPayments:prior_payments,status,dueDate:due_date").eq("booking_id", booking.id).order("issue_date", { ascending: false }),
        )
      : [],
    booking?.quotationId ? maybe<{ id: string; number: string; total: number; status: string }>(adminDb.from(tbl(schema.quotations)).select("id,number,total,status").eq("id", booking.quotationId)) : null,
    booking && customerId && can.record && booking.status !== "CANCELLED" ? payableCustomer(customerId) : null,
    can.expenses
      ? many<{ id: string; spentOn: string; description: string; payee: string | null; amount: number; cat: { name: string } | null; v: { name: string } | null }>(
          adminDb
            .from(tbl(schema.expenses))
            .select("id,spentOn:date,description,payee,amount,cat:expense_categories(name),v:vendors(name)")
            .eq("event_id", eventId)
            .order("date", { ascending: false }),
        )
      : [],
  ]);
  const expenseTotal = expenses.reduce((t, e) => t + e.amount, 0);
  const payProps = { customer: payable, bookingId: booking?.id ?? null, canAdjust: can.adjust, canAttach: can.attach };
  const hasInvoice = invoices.some((i) => i.status !== "CANCELLED");

  return (
    <div className="space-y-4">
      {!booking ? (
        <EmptyState title="No booking">Payments and invoices belong to the booking. Expenses recorded against this event still appear below.</EmptyState>
      ) : (
        can.payments &&
        fin && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-a-muted">
                Booking{" "}
                <Link href={`/admin/bookings/${booking.id}?tab=payments`} className="font-medium text-a-text hover:underline">
                  {booking.number}
                </Link>
                {quote && (
                  <>
                    {" "}
                    · accepted quotation{" "}
                    <Link href={`/admin/quotations/${quote.id}`} className="hover:underline">
                      {quote.number}
                    </Link>{" "}
                    {npr(quote.total)} <StatusBadge map={QUOTE_STATUS} value={quote.status} />
                  </>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {can.createInvoice && !hasInvoice && booking.status !== "CANCELLED" && (
                  <CreateInvoiceButton bookingId={booking.id} dueDate={null} received={fin.received} total={booking.totalAmount} size="sm" />
                )}
                {payable && fin.received === 0 && <RecordPaymentButton {...payProps} type="ADVANCE" variant="secondary" size="sm" />}
                {payable && <RecordPaymentButton {...payProps} size="sm" />}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="Booking amount" value={npr(booking.totalAmount)} />
              <Stat label="Invoiced" value={npr(fin.invoiced)} />
              <Stat label="Received" value={npr(fin.received)} hint={fin.refunded ? `after ${npr(fin.refunded)} refunded` : fin.advanceReceived ? `incl. ${npr(fin.advanceReceived)} advance` : undefined} />
              <Stat label="Outstanding" value={npr(fin.outstanding)} danger={fin.outstanding > 0} hint={fin.credit ? `${npr(fin.credit)} customer credit` : BOOKING_PAY_STATUS[fin.paymentStatus]?.label} />
              <Stat label="Not on an invoice" value={npr(fin.unallocated)} hint={hasInvoice ? "apply it from the payment" : "the invoice will count it"} />
            </div>
            <Card title="Payments & advances" bodyClassName="p-0">
              {payments.length === 0 ? (
                <EmptyState compact icon={Receipt} title="No payments yet" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Receipt</Th>
                      <Th>Date</Th>
                      <Th>Method</Th>
                      <Th>Invoice</Th>
                      <Th className="text-right">Amount</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <Td>
                          <Link href={`/admin/finance/payments/${p.id}`} className="font-medium hover:underline">
                            {p.number}
                          </Link>
                          <span className="block text-xs text-a-muted">
                            {PAYMENT_TYPE_LABEL[p.paymentType]}
                            {p.reference ? ` · ${p.reference}` : ""}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap">{fmtDate(p.paidAt)}</Td>
                        <Td>{methodLabel(p.method)}</Td>
                        <Td className="text-xs">{p.invoiceNumbers ?? "—"}</Td>
                        <Td className={`text-right tabular-nums ${p.status === "REVERSED" ? "text-a-muted line-through" : ""}`}>
                          {npr(p.amount)}
                          {p.refunded > 0 && <span className="block text-xs text-a-muted">−{npr(p.refunded)} refunded</span>}
                        </Td>
                        <Td className="text-right">
                          <span className="inline-flex items-center gap-2">
                            {p.status !== "VALID" && <Badge tone={PAYMENT_STATE[p.status]?.tone}>{PAYMENT_STATE[p.status]?.label}</Badge>}
                            <ReceiptLink id={p.id} disabled={p.status === "REVERSED" || p.netAmount <= 0} />
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
            <Card title="Invoices" bodyClassName="p-0">
              {invoices.length === 0 ? (
                <EmptyState compact icon={FileText} title="No invoice yet">
                  Payments already received are counted when the invoice is created.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-a-border">
                  {invoices.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                      <Link href={`/admin/invoices/${inv.id}`} className="flex-1 font-medium hover:underline">
                        {inv.number}
                        {inv.dueDate && <span className="block text-xs font-normal text-a-muted">due {fmtDate(inv.dueDate)}</span>}
                      </Link>
                      <span className="text-right tabular-nums">
                        {npr(inv.amountPaid)} / {npr(inv.total)}
                        {inv.priorPayments > 0 && <span className="block text-xs text-a-muted">{npr(inv.priorPayments)} advance</span>}
                      </span>
                      <StatusBadge map={INVOICE_STATUS} value={inv.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )
      )}
      {can.expenses && (
        <Card
          title="Event expenses"
          description={expenses.length ? `${npr(expenseTotal)} across ${expenses.length} expense${expenses.length === 1 ? "" : "s"}` : undefined}
          bodyClassName="p-0"
          actions={
            <Link href={`/admin/expenses?event=${eventId}`} className="text-[13px] hover:underline">
              Open in Expenses
            </Link>
          }
        >
          {expenses.length === 0 ? (
            <EmptyState compact title="No expenses recorded for this event" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Expense</Th>
                  <Th>Category</Th>
                  <Th>Paid to</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <Td className="whitespace-nowrap">{fmtDate(e.spentOn)}</Td>
                    <Td>{e.description}</Td>
                    <Td>{e.cat?.name ?? "—"}</Td>
                    <Td>{e.v?.name ?? e.payee ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{npr(e.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({ label: l, value, danger, hint }: { label: string; value: string; danger?: boolean; hint?: string }) {
  return (
    <div className="rounded-xl border border-a-border bg-a-surface p-4">
      <span className="text-[13px] text-a-muted">{l}</span>
      <span className={`mt-1 block font-serif text-xl font-medium tabular-nums sm:text-2xl ${danger ? "text-a-danger" : ""}`}>{value}</span>
      {hint && <span className="mt-1 block text-xs text-a-muted">{hint}</span>}
    </div>
  );
}

/* ───────── Related records (documents tab) ───────── */

export async function RelatedRecords({ booking }: { booking: Awaited<ReturnType<typeof bookingContext>> }) {
  if (!booking) return null;
  const [quote, inquiry, invoices, payments] = await Promise.all([
    booking.quotationId ? maybe<{ id: string; number: string }>(adminDb.from(tbl(schema.quotations)).select("id,number").eq("id", booking.quotationId)) : null,
    booking.inquiryId ? maybe<{ id: string; number: string; attachments: string[] }>(adminDb.from(tbl(schema.inquiries)).select("id,number,attachments").eq("id", booking.inquiryId)) : null,
    many<{ id: string; number: string }>(adminDb.from(tbl(schema.invoices)).select("id,number").eq("booking_id", booking.id)),
    many<{ id: string; number: string }>(adminDb.from(tbl(schema.payments)).select("id,number").eq("booking_id", booking.id).is("voided_at", null)),
  ]);
  const links: { href: string; text: string; external?: boolean }[] = [];
  if (inquiry) links.push({ href: `/admin/inquiries/${inquiry.id}`, text: `Inquiry ${inquiry.number}${inquiry.attachments.length ? ` (${inquiry.attachments.length} attachment${inquiry.attachments.length === 1 ? "" : "s"})` : ""}` });
  if (quote) links.push({ href: `/admin/print/quotation/${quote.id}`, text: `Quotation ${quote.number}`, external: true });
  links.push({ href: `/admin/bookings/${booking.id}`, text: `Booking ${booking.number}` });
  for (const i of invoices) links.push({ href: `/admin/print/invoice/${i.id}`, text: `Invoice ${i.number}`, external: true });
  if (payments.length) links.push({ href: `/admin/bookings/${booking.id}?tab=payments`, text: `${payments.length} payment receipt${payments.length === 1 ? "" : "s"} (${payments.map((p) => p.number).join(", ")})` });
  return (
    <Card title="Sales documents" description="The inquiry, quotation, invoices and receipts behind this event.">
      <ul className="space-y-1.5 text-[13px]">
        {links.map((l) => (
          <li key={l.href} className="flex items-center gap-2">
            <FileText className="size-4 text-a-muted" aria-hidden />
            <Link href={l.href} target={l.external ? "_blank" : undefined} className="hover:underline">
              {l.text}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
