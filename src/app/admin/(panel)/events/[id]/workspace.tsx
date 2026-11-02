import Link from "next/link";
import { CheckCircle2, ClipboardList, FileText, Receipt } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { fmtDate, fmtDateTime, npr, num } from "@/lib/format";
import { signedUrl } from "@/server/storage";
import { DESIGN_STATUS, INQUIRY_STATUS, PRIORITY, QUOTE_STATUS, SERVICE_STATUS, StatusBadge, TASK_STATUS, WORK_ORDER_STATUS, label } from "@/components/admin/status";
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

export async function FinanceTab({ booking, canPayments }: { booking: Awaited<ReturnType<typeof bookingContext>>; canPayments: boolean }) {
  if (!booking) return <EmptyState title="No booking">Payments and invoices belong to the booking.</EmptyState>;
  if (!canPayments) return null;
  const [payments, invoices, quote] = await Promise.all([
    many<{ id: string; number: string; amount: number; method: string; paidAt: string; reference: string | null; voidedAt: string | null }>(
      adminDb.from(tbl(schema.payments)).select("id,number,amount,method,paidAt:paid_at,reference,voidedAt:voided_at").eq("booking_id", booking.id).order("paid_at", { ascending: false }),
    ),
    many<{ id: string; number: string; total: number; amountPaid: number; status: string; dueDate: string | null }>(
      adminDb.from(tbl(schema.invoices)).select("id,number,total,amountPaid:amount_paid,status,dueDate:due_date").eq("booking_id", booking.id).order("issue_date", { ascending: false }),
    ),
    booking.quotationId ? maybe<{ id: string; number: string; total: number; status: string }>(adminDb.from(tbl(schema.quotations)).select("id,number,total,status").eq("id", booking.quotationId)) : null,
  ]);
  const balance = Math.max(0, booking.totalAmount - booking.amountPaid);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Booking value" value={npr(booking.totalAmount)} />
        <Stat label="Received" value={npr(booking.amountPaid)} />
        <Stat label="Balance due" value={npr(balance)} danger={balance > 0} />
      </div>
      {quote && (
        <p className="text-[13px] text-a-muted">
          Accepted quotation{" "}
          <Link href={`/admin/quotations/${quote.id}`} className="hover:underline">
            {quote.number}
          </Link>{" "}
          · {npr(quote.total)} <StatusBadge map={QUOTE_STATUS} value={quote.status} />
        </p>
      )}
      <Card title="Payments" bodyClassName="p-0" actions={<Link href={`/admin/bookings/${booking.id}?tab=payments`} className="text-[13px] hover:underline">Record on the booking</Link>}>
        {payments.length === 0 ? (
          <EmptyState compact icon={Receipt} title="No payments yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className={p.voidedAt ? "text-a-muted line-through" : undefined}>
                  <Td>
                    <span className="font-medium">{p.number}</span>
                    {p.reference && <span className="block text-xs text-a-muted">{p.reference}</span>}
                  </Td>
                  <Td>{fmtDate(p.paidAt)}</Td>
                  <Td>{label(p.method)}</Td>
                  <Td className="text-right tabular-nums">{npr(p.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card title="Invoices" bodyClassName="p-0">
        {invoices.length === 0 ? (
          <EmptyState compact icon={FileText} title="No invoices" />
        ) : (
          <ul className="divide-y divide-a-border">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <Link href={`/admin/invoices/${inv.id}`} className="flex-1 font-medium hover:underline">
                  {inv.number}
                </Link>
                <span className="tabular-nums">
                  {npr(inv.amountPaid)} / {npr(inv.total)}
                </span>
                <Badge>{label(inv.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label: l, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-a-border bg-a-surface p-4">
      <span className="text-[13px] text-a-muted">{l}</span>
      <span className={`mt-1 block font-serif text-2xl font-medium tabular-nums ${danger ? "text-a-danger" : ""}`}>{value}</span>
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
