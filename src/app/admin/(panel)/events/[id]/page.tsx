import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarCheck, FileText, Images, Printer, Users } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, fmtTime, npr, num, relativeTime } from "@/lib/format";
import { isUuid, listParams } from "@/lib/list";
import { staffConflicts } from "@/server/automation";
import { eventProfits, vendorPaid, vendorPaymentStatus } from "@/server/finance";
import { availabilityForEvent } from "@/server/inventory";
import { eventTypeName, eventTypeOptions, staffOptions, userOptions, vendorOptions } from "@/server/lookups";
import { signedUrl } from "@/server/storage";
import Notes from "@/components/admin/Notes";
import UploadButton from "@/components/admin/Upload";
import { BOOKING_STATUS, DESIGN_STATUS, EVENT_STATUS, PAY_STATUS, PRIORITY, StatusBadge, TASK_STATUS, VENDOR_STATUS, label } from "@/components/admin/status";
import { Badge, Card, DetailList, EmptyState, LinkButton, Notice, PageHeader, ProgressBar, Table, Tabs, Td, Th } from "@/components/admin/ui";
import { uploadDesignFiles, uploadDocument } from "../../upload-actions";
import {
  AssignStaffButton,
  ChecklistButton,
  DeleteDocumentButton,
  DeleteTaskButton,
  DeleteTimelineButton,
  DesignButton,
  DesignStatusButtons,
  EditEventButton,
  EventNoteForm,
  RemoveStaffButton,
  ReserveButton,
  ReturnButton,
  TaskButton,
  TaskCheck,
  TaskStatusSelect,
  TimelineButton,
  TimelineDone,
  VendorAssignmentButton,
} from "../EventClient";

export const metadata: Metadata = { title: "Event" };

const TABS = ["overview", "tasks", "team", "vendors", "inventory", "timeline", "designs", "documents", "profit"] as const;
type Tab = (typeof TABS)[number];

export default async function EventPage({ params, searchParams }: PageProps<"/admin/events/[id]">) {
  const user = await requirePage("events.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { str } = listParams(await searchParams);
  const event = await maybe<
    Row<typeof schema.events> & {
      customer: { id: string; name: string; phone: string | null } | null;
      booking: { id: string; number: string; status: string; totalAmount: number; amountPaid: number } | null;
    }
  >(adminDb.from(tbl(schema.events)).select(`${cols(schema.events)},customer:customers(id,name,phone),booking:bookings(id,number,status,totalAmount:total_amount,amountPaid:amount_paid)`).eq("id", id));
  if (!event) notFound();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const tab: Tab = (TABS as readonly string[]).includes(str("tab") ?? "") ? (str("tab") as Tab) : "overview";
  const closed = ["COMPLETED", "CANCELLED"].includes(event.status);
  const plan = can("events.update") && !closed;
  const base = `/admin/events/${id}`;

  const [types, counts] = await Promise.all([
    eventTypeOptions(),
    Promise.all([
      many<{ status: string }>(adminDb.from(tbl(schema.eventTasks)).select("status").eq("event_id", id)),
      many<{ id: string }>(adminDb.from(tbl(schema.staffAssignments)).select("id").eq("event_id", id)),
      many<{ id: string }>(adminDb.from(tbl(schema.vendorAssignments)).select("id").eq("event_id", id).neq("status", "CANCELLED")),
    ]),
  ]);
  const [taskRows, teamRows, vendorRows] = counts;
  const openTasks = taskRows.filter((t) => t.status !== "COMPLETED").length;
  const days = Math.round((new Date(`${event.eventDate}T00:00:00+05:45`).getTime() - Date.now()) / 86_400_000);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/events", label: "Events" }}
        eyebrow={`${eventTypeName(types, event.eventType)} · ${fmtDate(event.eventDate)}${!closed && days >= 0 ? ` · ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}` : ""}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {event.title}
            <StatusBadge map={EVENT_STATUS} value={event.status} />
          </span>
        }
        description={[event.venue, event.customer?.name, event.guestCount ? `${num(event.guestCount)} guests` : null].filter(Boolean).join(" · ")}
        actions={
          <>
            {event.booking && can("bookings.view") && (
              <LinkButton href={`/admin/bookings/${event.booking.id}`} icon={CalendarCheck}>
                {event.booking.number}
              </LinkButton>
            )}
            {event.status === "COMPLETED" && can("cms.manage") && (
              <LinkButton href={`/admin/website/gallery?fromEvent=${id}`} icon={Images}>
                Add to gallery
              </LinkButton>
            )}
            <LinkButton href={`/admin/print/event/${id}`} icon={Printer} target="_blank">
              Day sheet
            </LinkButton>
            {plan && <EditEventButton values={event} eventTypes={types} />}
          </>
        }
      />

      <Tabs
        active={tab}
        items={[
          { key: "overview", label: "Overview", href: base },
          { key: "tasks", label: "Tasks", href: `${base}?tab=tasks`, count: openTasks },
          { key: "team", label: "Team", href: `${base}?tab=team`, count: teamRows.length },
          ...(can("vendors.view") ? [{ key: "vendors", label: "Vendors", href: `${base}?tab=vendors`, count: vendorRows.length }] : []),
          ...(can("inventory.view") ? [{ key: "inventory", label: "Inventory", href: `${base}?tab=inventory` }] : []),
          { key: "timeline", label: "Run sheet", href: `${base}?tab=timeline` },
          { key: "designs", label: "Designs", href: `${base}?tab=designs` },
          ...(can("documents.view") ? [{ key: "documents", label: "Documents", href: `${base}?tab=documents` }] : []),
          ...(can("expenses.view") ? [{ key: "profit", label: "Profit", href: `${base}?tab=profit` }] : []),
        ]}
      />

      {tab === "overview" && <Overview event={event} types={types} openTasks={openTasks} totalTasks={taskRows.length} team={teamRows.length} canMoney={can("payments.view")} canEdit={can("events.update")} />}
      {tab === "tasks" && <TasksTab eventId={id} plan={plan} canStatus={can("events.update") || can("tasks.update")} />}
      {tab === "team" && <TeamTab eventId={id} plan={plan} />}
      {tab === "vendors" && can("vendors.view") && <VendorsTab eventId={id} manage={can("vendors.manage") && !closed} money={can("expenses.view")} />}
      {tab === "inventory" && can("inventory.view") && <InventoryTab eventId={id} adjust={(can("inventory.adjust") || can("bookings.update")) && event.status !== "CANCELLED"} />}
      {tab === "timeline" && <TimelineTab eventId={id} date={event.eventDate} plan={plan} />}
      {tab === "designs" && <DesignsTab eventId={id} plan={plan} />}
      {tab === "documents" && can("documents.view") && <DocumentsTab eventId={id} customerId={event.customerId} manage={can("documents.manage")} />}
      {tab === "profit" && can("expenses.view") && <ProfitTab eventId={id} />}
    </>
  );
}

/* ───────── Tabs ───────── */

async function Overview({
  event,
  types,
  openTasks,
  totalTasks,
  team,
  canMoney,
  canEdit,
}: {
  event: Row<typeof schema.events> & { customer: { id: string; name: string; phone: string | null } | null; booking: { id: string; number: string; status: string; totalAmount: number; amountPaid: number } | null };
  types: { value: string; label: string }[];
  openTasks: number;
  totalTasks: number;
  team: number;
  canMoney: boolean;
  canEdit: boolean;
}) {
  const notes = await many<Row<typeof schema.eventNotes> & { p: { fullName: string } | null }>(
    adminDb.from(tbl(schema.eventNotes)).select(`${cols(schema.eventNotes)},p:profiles(fullName:full_name)`).eq("event_id", event.id).order("created_at", { ascending: false }).limit(30),
  );
  const balance = event.booking ? Math.max(0, event.booking.totalAmount - event.booking.amountPaid) : 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat label="Tasks open" value={`${openTasks} / ${totalTasks}`} href={`/admin/events/${event.id}?tab=tasks`} />
          <MiniStat label="Team assigned" value={String(team)} href={`/admin/events/${event.id}?tab=team`} />
          {canMoney && event.booking && <MiniStat label="Balance due" value={npr(balance)} href={`/admin/bookings/${event.booking.id}?tab=payments`} />}
        </div>
        {totalTasks > 0 && <ProgressBar value={totalTasks - openTasks} max={totalTasks} label="Tasks complete" tone="success" />}
        <Card title="Requirements">{event.requirements ? <p className="whitespace-pre-line">{event.requirements}</p> : <p className="text-[13px] text-a-muted">No requirements recorded.</p>}</Card>
        <Card title="Event notes" description="Shared notes appear in the client portal; internal ones never do.">
          {canEdit && (
            <div className="mb-4">
              <EventNoteForm eventId={event.id} />
            </div>
          )}
          {notes.length === 0 ? (
            <p className="text-[13px] text-a-muted">No notes yet.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map(({ p, ...n }) => (
                <li key={n.id} className="rounded-lg border border-a-border p-3">
                  <p className="whitespace-pre-line">{n.body}</p>
                  <p className="mt-1.5 flex items-center gap-2 text-xs text-a-muted">
                    {n.visibility === "CLIENT" ? <Badge tone="info">Shared with client</Badge> : <Badge tone="gold">Internal</Badge>}
                    {p?.fullName ?? "Team"} · {relativeTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Notes entityType="event" entityId={event.id} canEdit={canEdit} />
      </div>
      <div className="space-y-4">
        <Card title="Details">
          <DetailList
            columns={1}
            items={[
              ["Type", eventTypeName(types, event.eventType)],
              ["Date", fmtDate(event.eventDate)],
              ["Time", event.startTime ? `${event.startTime.slice(0, 5)}${event.endTime ? ` – ${event.endTime.slice(0, 5)}` : ""}` : null],
              ["Décor window", `${fmtDateTime(event.startAt)} → ${fmtTime(event.endAt)}`],
              ["Venue", event.venue],
              ["Address", event.venueAddress],
              ["Guests", event.guestCount ? num(event.guestCount) : null],
              ["Colour theme", event.colorTheme],
            ]}
          />
        </Card>
        <Card title="Client">
          {event.customer ? (
            <DetailList
              columns={1}
              items={[
                ["Name", <Link key="n" href={`/admin/customers/${event.customer.id}`} className="hover:underline">{event.customer.name}</Link>],
                ["Phone", event.customer.phone],
                ["Booking", event.booking ? <span key="b" className="flex items-center gap-2">{event.booking.number} <StatusBadge map={BOOKING_STATUS} value={event.booking.status} /></span> : null],
              ]}
            />
          ) : (
            <p className="text-[13px] text-a-muted">Internal event.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

async function TasksTab({ eventId, plan, canStatus }: { eventId: string; plan: boolean; canStatus: boolean }) {
  const [tasks, staff, users, templates] = await Promise.all([
    many<Row<typeof schema.eventTasks> & { s: { name: string } | null; u: { fullName: string } | null }>(
      adminDb.from(tbl(schema.eventTasks)).select(`${cols(schema.eventTasks)},s:staff(name),u:profiles!assignee_user_id(fullName:full_name)`).eq("event_id", eventId).order("position").order("due_at", { nullsFirst: false }),
    ),
    staffOptions(),
    userOptions(),
    many<{ value: string; label: string }>(adminDb.from(tbl(schema.checklistTemplates)).select("value:id,label:name").order("name")),
  ]);
  const groups = [
    { key: "PRE", title: "Pre-event checklist" },
    { key: null, title: "Tasks" },
    { key: "POST", title: "Post-event checklist" },
  ] as const;
  const now = Date.now();
  return (
    <div className="space-y-4">
      {plan && (
        <div className="flex flex-wrap gap-2">
          <TaskButton eventId={eventId} staff={staff} users={users} />
          <ChecklistButton eventId={eventId} templates={templates} />
        </div>
      )}
      {tasks.length === 0 && <EmptyState title="No tasks yet">Add tasks or a ready-made checklist so nothing is forgotten.</EmptyState>}
      {groups.map((g) => {
        const list = tasks.filter((t) => t.checklist === g.key);
        if (!list.length) return null;
        const done = list.filter((t) => t.status === "COMPLETED").length;
        return (
          <Card key={g.title} title={g.title} description={`${done} of ${list.length} done`} bodyClassName="p-0">
            <ul className="divide-y divide-a-border">
              {list.map(({ s, u, ...t }) => {
                const late = t.dueAt && t.dueAt.getTime() < now && t.status !== "COMPLETED";
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    {canStatus && <TaskCheck id={t.id} done={t.status === "COMPLETED"} title={t.title} />}
                    <div className="min-w-0 flex-1">
                      <p className={t.status === "COMPLETED" ? "text-a-muted line-through" : "font-medium"}>{t.title}</p>
                      <p className="text-xs text-a-muted">
                        {[s?.name, u?.fullName].filter(Boolean).join(" · ") || "Unassigned"}
                        {t.dueAt && <span className={late ? " font-medium text-a-danger" : undefined}> · due {fmtDateTime(t.dueAt)}</span>}
                      </p>
                    </div>
                    {t.priority !== "MEDIUM" && <StatusBadge map={PRIORITY} value={t.priority} />}
                    {canStatus ? <TaskStatusSelect id={t.id} status={t.status} /> : <StatusBadge map={TASK_STATUS} value={t.status} />}
                    {plan && (
                      <span className="flex">
                        <TaskButton eventId={eventId} staff={staff} users={users} values={t} />
                        <DeleteTaskButton id={t.id} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

async function TeamTab({ eventId, plan }: { eventId: string; plan: boolean }) {
  const [rows, staff] = await Promise.all([
    many<Row<typeof schema.staffAssignments> & { s: { id: string; name: string; role: string | null; phone: string | null } }>(
      adminDb.from(tbl(schema.staffAssignments)).select(`${cols(schema.staffAssignments)},s:staff!inner(id,name,role,phone)`).eq("event_id", eventId).order("created_at"),
    ),
    staffOptions(),
  ]);
  const conflicts = await Promise.all(rows.map((r) => staffConflicts(r.staffId, eventId)));
  return (
    <Card title="Team" bodyClassName="p-0" actions={plan && <AssignStaffButton eventId={eventId} staff={staff} />}>
      {rows.length === 0 ? (
        <EmptyState compact icon={Users} title="No one assigned yet" />
      ) : (
        <ul className="divide-y divide-a-border">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/admin/staff/${r.s.id}`} className="font-medium hover:underline">
                  {r.s.name}
                </Link>
                <p className="text-xs text-a-muted">
                  {r.role ?? r.s.role ?? "Team"} · {num(r.days)} day{r.days === 1 ? "" : "s"}
                  {r.s.phone ? ` · ${r.s.phone}` : ""}
                </p>
                {conflicts[i]!.length > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-a-danger">
                    <AlertTriangle className="size-3.5" aria-hidden /> Also on {conflicts[i]!.map((c) => `${c.title} (${fmtDate(c.date)})`).join(", ")}
                  </p>
                )}
              </div>
              {plan && <RemoveStaffButton id={r.id} name={r.s.name} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function VendorsTab({ eventId, manage, money }: { eventId: string; manage: boolean; money: boolean }) {
  const [rows, vendors] = await Promise.all([
    many<Row<typeof schema.vendorAssignments> & { v: { id: string; name: string; phone: string | null; category: string } }>(
      adminDb.from(tbl(schema.vendorAssignments)).select(`${cols(schema.vendorAssignments)},v:vendors!inner(id,name,phone,category)`).eq("event_id", eventId).order("created_at"),
    ),
    vendorOptions(),
  ]);
  const paid = money ? await vendorPaid(rows.map((r) => r.id)) : new Map<string, number>();
  return (
    <Card title="Vendor bookings" bodyClassName="p-0" actions={manage && <VendorAssignmentButton eventId={eventId} vendors={vendors} />}>
      {rows.length === 0 ? (
        <EmptyState compact title="No vendors booked" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Vendor</Th>
              <Th>Service</Th>
              <Th>Status</Th>
              {money && <Th className="text-right">Cost</Th>}
              {money && <Th>Paid</Th>}
              <Th>Due</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ v, ...r }) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/admin/vendors/${v.id}`} className="font-medium hover:underline">
                    {v.name}
                  </Link>
                  <span className="block text-xs text-a-muted">{label(v.category)}</span>
                </Td>
                <Td>{r.service}</Td>
                <Td>
                  <StatusBadge map={VENDOR_STATUS} value={r.status} />
                </Td>
                {money && <Td className="text-right tabular-nums">{npr(r.cost)}</Td>}
                {money && (
                  <Td>
                    <StatusBadge map={PAY_STATUS} value={vendorPaymentStatus(r.cost, paid.get(r.id) ?? 0)} />
                  </Td>
                )}
                <Td>{fmtDate(r.dueDate)}</Td>
                <Td>{manage && <VendorAssignmentButton eventId={eventId} vendors={vendors} values={r} />}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

async function InventoryTab({ eventId, adjust }: { eventId: string; adjust: boolean }) {
  const header = await maybe<{ id: string; status: string }>(adminDb.from(tbl(schema.inventoryReservations)).select("id,status").eq("event_id", eventId));
  const [lines, stock] = await Promise.all([
    header
      ? many<Row<typeof schema.inventoryReservationItems> & { item: { id: string; name: string; sku: string; unit: string; consumable: boolean } }>(
          adminDb.from(tbl(schema.inventoryReservationItems)).select(`${cols(schema.inventoryReservationItems)},item:inventory_items!inner(id,name,sku,unit,consumable)`).eq("reservation_id", header.id).order("created_at"),
        )
      : [],
    adjust ? availabilityForEvent(eventId) : [],
  ]);
  const held = new Map(lines.filter((l) => ["RESERVED", "CHECKED_OUT"].includes(l.status)).map((l) => [l.itemId, l.quantity]));
  const picker = stock.map((s) => ({ id: s.id, name: s.name, sku: s.sku, unit: s.unit, category: null, available: Math.max(0, s.availableForEvent), reserved: held.get(s.id) ?? 0 }));
  const shortages = stock.filter((s) => s.availableForEvent < 0);
  return (
    <div className="space-y-4">
      {shortages.length > 0 && (
        <Notice tone="danger" title="Over-booked stock">
          {shortages.map((s) => s.name).join(", ")} — overlapping events hold more than you own.
        </Notice>
      )}
      <Card title="Reserved inventory" description="Held for this event's décor window. Starting the event checks items out; record returns afterwards." bodyClassName="p-0" actions={adjust && <ReserveButton eventId={eventId} items={picker} />}>
        {lines.length === 0 ? (
          <EmptyState compact title="Nothing reserved">
            Reserve backdrops, furniture, lights and props so they can't be double-booked.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Qty</Th>
                <Th>Status</Th>
                <Th>Returned</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <Link href={`/admin/inventory/${l.item.id}`} className="font-medium hover:underline">
                      {l.item.name}
                    </Link>
                    <span className="block text-xs text-a-muted">{l.item.sku}</span>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {l.quantity} {l.item.unit}
                  </Td>
                  <Td>
                    <Badge tone={l.status === "CHECKED_OUT" ? "info" : l.status === "RESERVED" ? "accent" : "neutral"}>{label(l.status)}</Badge>
                  </Td>
                  <Td className="text-xs">{l.status === "RETURNED" ? `${l.returnedDamaged} damaged · ${l.returnedLost} lost · ${l.used} used` : "—"}</Td>
                  <Td className="text-right">{adjust && ["RESERVED", "CHECKED_OUT"].includes(l.status) && <ReturnButton id={l.id} name={l.item.name} quantity={l.quantity} consumable={l.item.consumable} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

async function TimelineTab({ eventId, date, plan }: { eventId: string; date: string; plan: boolean }) {
  const [rows, staff] = await Promise.all([
    many<Row<typeof schema.eventTimeline> & { s: { name: string } | null }>(adminDb.from(tbl(schema.eventTimeline)).select(`${cols(schema.eventTimeline)},s:staff(name)`).eq("event_id", eventId).order("starts_at")),
    staffOptions(),
  ]);
  return (
    <Card title="Run sheet" description="The hour-by-hour plan for the day." bodyClassName="p-0" actions={plan && <TimelineButton eventId={eventId} staff={staff} defaultDate={date} />}>
      {rows.length === 0 ? (
        <EmptyState compact title="No run sheet yet" />
      ) : (
        <ol className="divide-y divide-a-border">
          {rows.map(({ s, ...r }) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3">
              {plan && <TimelineDone id={r.id} done={r.status === "COMPLETED"} />}
              <span className="w-24 shrink-0 font-semibold tabular-nums">
                {fmtTime(r.startsAt)}
                {fmtDate(r.startsAt) !== fmtDate(date) && <span className="block text-xs font-normal text-a-muted">{fmtDate(r.startsAt)}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <p className={r.status === "COMPLETED" ? "text-a-muted line-through" : "font-medium"}>{r.title}</p>
                <p className="text-xs text-a-muted">{[s?.name, r.notes].filter(Boolean).join(" · ")}</p>
              </div>
              {plan && (
                <span className="flex">
                  <TimelineButton eventId={eventId} staff={staff} defaultDate={date} values={r} />
                  <DeleteTimelineButton id={r.id} />
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

async function DesignsTab({ eventId, plan }: { eventId: string; plan: boolean }) {
  const designs = await many<Row<typeof schema.designApprovals>>(adminDb.from(tbl(schema.designApprovals)).select(cols(schema.designApprovals)).eq("event_id", eventId).order("created_at", { ascending: false }));
  const mediaIds = designs.flatMap((d) => d.mediaIds);
  const media = mediaIds.length ? await many<{ id: string; bucket: string; path: string; filename: string; mime: string }>(adminDb.from(tbl(schema.media)).select("id,bucket,path,filename,mime").in("id", mediaIds)) : [];
  const links = new Map(await Promise.all(media.map(async (m) => [m.id, { ...m, url: await signedUrl(m.bucket, m.path, 1800).catch(() => null) }] as const)));
  return (
    <div className="space-y-4">
      {plan && <DesignButton eventId={eventId} />}
      {designs.length === 0 && <EmptyState title="No designs yet">Share mood boards and stage concepts here and record the client's approval.</EmptyState>}
      {designs.map((d) => (
        <Card
          key={d.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {d.title} <Badge icon={false}>v{d.version}</Badge> <StatusBadge map={DESIGN_STATUS} value={d.status} />
            </span>
          }
          description={d.sentAt ? `Sent ${fmtDateTime(d.sentAt)}${d.respondedAt ? ` · answered ${fmtDateTime(d.respondedAt)}` : ""}` : "Not sent yet"}
          actions={plan && <DesignButton eventId={eventId} values={d} />}
        >
          {d.description && <p className="mb-3 whitespace-pre-line">{d.description}</p>}
          {d.clientResponse && (
            <div className="mb-3">
              <Notice tone={d.status === "APPROVED" ? "success" : "warning"} title="Client response">
                “{d.clientResponse}”
              </Notice>
            </div>
          )}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {d.mediaIds.map((mid) => {
              const m = links.get(mid);
              if (!m) return null;
              return m.mime.startsWith("image/") && m.url ? (
                <a key={mid} href={m.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-a-border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
                  <img src={m.url} alt={m.filename} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                </a>
              ) : (
                <a key={mid} href={m.url ?? "#"} target="_blank" rel="noreferrer" className="flex aspect-[4/3] items-center justify-center gap-1 rounded-md border border-a-border p-2 text-center text-xs hover:bg-a-hover">
                  <FileText className="size-4" aria-hidden /> {m.filename}
                </a>
              );
            })}
          </div>
          {plan && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <UploadButton action={uploadDesignFiles} fields={{ designId: d.id }} label="Add files" size="sm" accept="image/*,application/pdf" success="Files added" />
              <DesignStatusButtons id={d.id} status={d.status} />
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

async function DocumentsTab({ eventId, customerId, manage }: { eventId: string; customerId: string | null; manage: boolean }) {
  const docs = await many<Row<typeof schema.documents>>(adminDb.from(tbl(schema.documents)).select(cols(schema.documents)).eq("event_id", eventId).is("deleted_at", null).order("created_at", { ascending: false }));
  const urls = await Promise.all(docs.map((d) => signedUrl(d.bucket, d.path, 600, d.title).catch(() => null)));
  return (
    <Card
      title="Documents"
      description="Private files — opened with short-lived links. Shared documents appear in the client portal."
      bodyClassName="p-0"
      actions={
        manage && (
          <UploadButton action={uploadDocument} fields={{ eventId, customerId }} label="Upload" size="sm" success="Document uploaded">
            <select name="kind" aria-label="Document type" className="h-8 rounded-md border border-a-border bg-a-surface px-2 text-[13px]" defaultValue="EVENT_BRIEF">
              <option value="EVENT_BRIEF">Event brief</option>
              <option value="CONTRACT">Contract</option>
              <option value="DESIGN">Design</option>
              <option value="RECEIPT">Receipt</option>
              <option value="OTHER">Other</option>
            </select>
            <label className="flex h-8 items-center gap-1.5 text-[13px]">
              <input type="checkbox" name="shared" className="size-4 accent-[var(--a-accent)]" /> Share with client
            </label>
          </UploadButton>
        )
      }
    >
      {docs.length === 0 ? (
        <EmptyState compact icon={FileText} title="No documents" />
      ) : (
        <ul className="divide-y divide-a-border">
          {docs.map((d, i) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
              <FileText className="size-4 shrink-0 text-a-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                {urls[i] ? (
                  <a href={urls[i]!} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {d.title}
                  </a>
                ) : (
                  <span className="font-medium">{d.title}</span>
                )}
                <p className="text-xs text-a-muted">
                  {label(d.kind)} · {fmtDate(d.createdAt)}
                </p>
              </div>
              {d.sharedWithCustomer && <Badge tone="info">Shared</Badge>}
              {manage && <DeleteDocumentButton id={d.id} title={d.title} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function ProfitTab({ eventId }: { eventId: string }) {
  const p = (await eventProfits([eventId])).get(eventId);
  if (!p) return <EmptyState title="No figures yet" />;
  const rows: [string, number, string?][] = [
    ["Vendor bookings", p.vendorCost],
    ["Staff (days × daily rate)", p.staffCost],
    ["Décor damaged, lost or used", p.inventoryLoss, "At replacement cost"],
    ["Other expenses", p.otherExpenses],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Profitability">
        <dl className="space-y-2 text-[13px]">
          <ProfitLine label="Revenue (booking value)" value={p.revenue} strong />
          <ProfitLine label="Collected" value={p.collected} />
          <ProfitLine label="Outstanding" value={p.outstanding} />
          <div className="border-t border-a-border pt-2" />
          <ProfitLine label="Estimated cost" value={p.estimatedCost} />
          <ProfitLine label="Actual cost" value={p.actualCost} strong />
          <div className="border-t border-a-border pt-2" />
          <div className={`flex justify-between text-base font-semibold ${p.grossProfit < 0 ? "text-a-danger" : "text-a-success"}`}>
            <dt>Gross profit</dt>
            <dd className="tabular-nums">
              {npr(p.grossProfit)}
              {p.margin !== null && <span className="ml-2 text-xs font-normal text-a-muted">{Math.round(p.margin)}% margin</span>}
            </dd>
          </div>
        </dl>
      </Card>
      <Card title="Actual cost breakdown">
        <ul className="space-y-2 text-[13px]">
          {rows.map(([l, v, hint]) => (
            <li key={l} className="flex justify-between gap-3">
              <span>
                {l}
                {hint && <span className="block text-xs text-a-muted">{hint}</span>}
              </span>
              <span className="tabular-nums">{npr(v)}</span>
            </li>
          ))}
        </ul>
        {p.estimatedCost > 0 && (
          <p className={`mt-4 text-xs ${p.actualCost > p.estimatedCost ? "text-a-danger" : "text-a-muted"}`}>
            {p.actualCost > p.estimatedCost ? `${npr(p.actualCost - p.estimatedCost)} over the estimate.` : `${npr(p.estimatedCost - p.actualCost)} under the estimate.`}
          </p>
        )}
      </Card>
    </div>
  );
}

function ProfitLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{npr(value)}</dd>
    </div>
  );
}

function MiniStat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-a-border bg-a-surface p-4 hover:border-a-strong">
      <span className="text-[13px] text-a-muted">{label}</span>
      <span className="mt-1 block font-serif text-2xl font-medium tabular-nums">{value}</span>
    </Link>
  );
}
