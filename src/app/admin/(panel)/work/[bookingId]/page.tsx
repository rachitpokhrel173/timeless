import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ClipboardList, Clock, FileText, History, MapPin, PartyPopper, Users } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, num, qty, serverNow } from "@/lib/format";
import { first, isUuid } from "@/lib/list";
import { cn } from "@/lib/utils";
import { assigneesFor, staffPicker, workEligibility, type Assignee } from "@/server/assignments";
import { eventTypeName, eventTypeOptions } from "@/server/lookups";
import { proofPhotos } from "@/server/work";
import { BOOKING_STATUS, PRIORITY, QUOTE_STATUS, StatusBadge, TASK_STATUS } from "@/components/admin/status";
import { Avatar, Badge, Card, DetailList, EmptyState, LinkButton, Notice, PageHeader, ProgressBar } from "@/components/admin/ui";
import { AssignButton, DeleteWorkTaskButton, DuplicateTaskButton, InternalNotesButton, PlannerStatusSelect, ReferenceUpload, RemoveReferenceButton, TaskFormButton } from "../WorkClient";

export const metadata: Metadata = { title: "Work plan" };

type Booking = {
  id: string;
  number: string;
  status: string;
  customer: { id: string; name: string };
  quote: { id: string; number: string; status: string } | null;
  event: Row<typeof schema.events> | Row<typeof schema.events>[] | null;
};
type Task = Row<typeof schema.eventTasks>;
type Update = {
  id: string;
  taskId: string;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: Date;
  s: { name: string } | null;
  a: { fullName: string } | null;
};
type Photo = { src: string; alt: string };

export default async function BookingWorkPage({ params }: PageProps<"/admin/work/[bookingId]">) {
  const user = await requirePage("events.view");
  const { bookingId } = await params;
  if (!isUuid(bookingId)) notFound();
  const booking = await maybe<Booking>(
    adminDb
      .from(tbl(schema.bookings))
      .select(`id,number,status,customer:customers!inner(id,name),quote:quotations(id,number,status),event:events(${cols(schema.events)})`)
      .eq("id", bookingId),
  );
  if (!booking) notFound();
  const event = first(booking.event);
  const planner = user.permissions.has("events.update");
  const eligible = workEligibility({ status: booking.status, quoteStatus: booking.quote?.status ?? null, hasEvent: !!event });

  const [items, tasks, types] = await Promise.all([
    // Quantities only — no prices on the work plan
    many<{ id: string; description: string; quantity: number; unit: string | null }>(adminDb.from(tbl(schema.bookingItems)).select("id,description,quantity,unit").eq("booking_id", bookingId).order("position")),
    event ? many<Task>(adminDb.from(tbl(schema.eventTasks)).select(cols(schema.eventTasks)).eq("event_id", event.id).order("position").order("created_at")) : [],
    eventTypeOptions(),
  ]);
  const ids = tasks.map((t) => t.id);
  const [assignees, updates, internal, staff] = await Promise.all([
    assigneesFor(ids),
    ids.length
      ? many<Update>(
          adminDb
            .from(tbl(schema.eventTaskUpdates))
            .select("id,taskId:task_id,kind,fromStatus:from_status,toStatus:to_status,note,createdAt:created_at,s:staff(name),a:profiles(fullName:full_name)")
            .in("task_id", ids)
            .order("created_at", { ascending: false })
            .limit(500),
        )
      : [],
    ids.length ? many<{ taskId: string; notes: string }>(adminDb.from(tbl(schema.eventTaskInternal)).select("taskId:task_id,notes").in("task_id", ids)) : [],
    planner && event ? staffPicker(event.eventDate, event.id) : [],
  ]);
  const photos = await proofPhotos([...tasks.flatMap((t) => [...t.proofMediaIds, ...t.referenceMediaIds]), ...[...assignees.values()].flat().flatMap((a) => a.proofMediaIds)]);

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "COMPLETED").length;
  const now = serverNow();
  const overdue = tasks.filter((t) => t.status !== "COMPLETED" && t.dueAt && t.dueAt.getTime() < now).length;
  const unassigned = tasks.filter((t) => !(assignees.get(t.id)?.length) && !t.assigneeUserId).length;
  const counts = (["TODO", "ACCEPTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as const).map((s) => [s, tasks.filter((t) => t.status === s).length] as const);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/work", label: "Work management" }}
        eyebrow={booking.number}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {event?.title ?? booking.number}
            <StatusBadge map={BOOKING_STATUS} value={booking.status} />
          </span>
        }
        description={
          <>
            {booking.customer.name}
            {event && ` · ${fmtDate(event.eventDate)}${event.venue ? ` · ${event.venue}` : ""}`}
          </>
        }
        actions={
          <>
            {user.permissions.has("bookings.view") && (
              <LinkButton href={`/admin/bookings/${booking.id}`} icon={FileText}>
                Booking
              </LinkButton>
            )}
            {event && (
              <LinkButton href={`/admin/events/${event.id}`} icon={PartyPopper}>
                Event workspace
              </LinkButton>
            )}
            {planner && eligible.ok && <TaskFormButton bookingId={booking.id} staff={staff} eventDate={event?.eventDate} variant="primary" />}
          </>
        }
      />

      {!eligible.ok && (
        <div className="mb-4">
          <Notice tone="warning" title="Not ready for work assignment">
            {eligible.reason} Tasks can be planned once the client has approved the quotation and the booking is confirmed.
          </Notice>
        </div>
      )}

      <div className="mb-5 rounded-xl border border-a-border bg-a-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] text-a-muted">Overall progress</p>
          <p className="font-serif text-2xl font-medium tabular-nums">
            {total ? Math.round((done / total) * 100) : 0}%<span className="ml-2 font-sans text-[13px] text-a-muted">{num(done)} of {num(total)} tasks done</span>
          </p>
        </div>
        <div className="mt-2">
          <ProgressBar value={done} max={total} label="Tasks completed" tone={total && done === total ? "success" : overdue ? "warning" : "accent"} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {counts
            .filter(([, n]) => n > 0)
            .map(([s, n]) => (
              <Badge key={s} tone={TASK_STATUS[s]!.tone}>
                {n} {TASK_STATUS[s]!.label.toLowerCase()}
              </Badge>
            ))}
          {overdue > 0 && <Badge tone="danger">{overdue} overdue</Badge>}
          {unassigned > 0 && <Badge tone="warning">{unassigned} unassigned</Badge>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <Card>
              <EmptyState
                icon={ClipboardList}
                title="No tasks yet"
                action={planner && eligible.ok ? <TaskFormButton bookingId={booking.id} staff={staff} eventDate={event?.eventDate} label="Add the first task" variant="primary" /> : undefined}
              >
                Break the approved decoration into tasks — stage, flowers, entrance, lighting, tables, backdrop, final inspection — and hand each to the team.
              </EmptyState>
            </Card>
          ) : (
            tasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                people={assignees.get(t.id) ?? []}
                history={updates.filter((u) => u.taskId === t.id)}
                internal={internal.find((n) => n.taskId === t.id)?.notes ?? ""}
                photos={photos}
                planner={planner}
                editable={planner && eligible.ok}
                bookingId={booking.id}
                staff={staff}
                eventDate={event?.eventDate}
                now={now}
              />
            ))
          )}
        </div>

        <div className="space-y-4">
          <Card title="Event">
            {event ? (
              <DetailList
                columns={1}
                items={[
                  ["Type", eventTypeName(types, event.eventType)],
                  ["Date", <span key="d" className="inline-flex items-center gap-1"><CalendarDays className="size-3.5 text-a-muted" aria-hidden /> {fmtDate(event.eventDate)}{event.startTime ? ` · ${event.startTime.slice(0, 5)}` : ""}</span>],
                  ["Venue", [event.venue, event.venueAddress].filter(Boolean).join(", ") || null],
                  ["Guests", event.guestCount ? num(event.guestCount) : null],
                  ["Colours", event.colorTheme],
                  ["Quotation", booking.quote ? (
                    <span key="q" className="inline-flex items-center gap-2">
                      {user.permissions.has("quotations.view") ? <Link href={`/admin/quotations/${booking.quote.id}`} className="hover:underline">{booking.quote.number}</Link> : booking.quote.number}
                      <StatusBadge map={QUOTE_STATUS} value={booking.quote.status} />
                    </span>
                  ) : "Booked directly"],
                ]}
              />
            ) : (
              <p className="text-[13px] text-a-muted">No event workspace.</p>
            )}
          </Card>
          <Card title="Decoration requirements" description={items.length ? "From the approved quotation." : undefined} bodyClassName={items.length ? "p-0" : undefined}>
            {event?.requirements && <p className={cn("text-[13px] whitespace-pre-line", items.length > 0 && "border-b border-a-border px-4 py-3")}>{event.requirements}</p>}
            {items.length > 0 ? (
              <ul className="divide-y divide-a-border text-[13px]">
                {items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 px-4 py-2">
                    <span>{i.description}</span>
                    <span className="shrink-0 text-a-muted tabular-nums">
                      {qty(i.quantity)} {i.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              !event?.requirements && <p className="text-[13px] text-a-muted">No itemised requirements on this booking.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

const KIND: Record<string, string> = { ASSIGNED: "assigned", UNASSIGNED: "removed" };

function TaskCard({
  task: t,
  people,
  history,
  internal,
  photos,
  planner,
  editable,
  bookingId,
  staff,
  eventDate,
  now,
}: {
  task: Task;
  people: Assignee[];
  history: Update[];
  internal: string;
  photos: Map<string, Photo>;
  planner: boolean;
  editable: boolean;
  bookingId: string;
  staff: Awaited<ReturnType<typeof staffPicker>>;
  eventDate?: string;
  now: number;
}) {
  const done = t.status === "COMPLETED";
  const late = !done && t.dueAt && t.dueAt.getTime() < now;
  const refs = t.referenceMediaIds.map((id) => ({ id, p: photos.get(id) })).filter((r): r is { id: string; p: Photo } => !!r.p);
  const proof = [...t.proofMediaIds, ...people.flatMap((p) => p.proofMediaIds)].map((id) => photos.get(id)).filter((p): p is Photo => !!p);
  return (
    <article className={cn("rounded-xl border border-a-border bg-a-surface", late && "border-l-4 border-l-a-danger", done && "bg-a-subtle/40")}>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className={cn("text-base font-semibold", done && "text-a-muted")}>{t.title}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-a-muted">
              {t.startDate && <span>Starts {fmtDate(t.startDate)}</span>}
              {t.dueAt && (
                <span className={cn("inline-flex items-center gap-1", late && "font-medium text-a-danger")}>
                  <Clock className="size-3" aria-hidden />
                  {late ? "Overdue — " : "Due "}
                  {fmtDateTime(t.dueAt)}
                </span>
              )}
              {t.teamRole && <span>{t.teamRole}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge map={PRIORITY} value={t.priority} />
            {planner ? <PlannerStatusSelect id={t.id} status={t.status} /> : <StatusBadge map={TASK_STATUS} value={t.status} />}
          </div>
        </div>

        {t.description && <p className="text-[13px] whitespace-pre-line">{t.description}</p>}
        {t.staffInstructions && (
          <p className="rounded-md bg-a-gold-soft/50 px-3 py-2 text-[13px] whitespace-pre-line">
            <span className="font-medium">For the team: </span>
            {t.staffInstructions}
          </p>
        )}
        {planner && internal && (
          <p className="rounded-md border border-dashed border-a-border px-3 py-2 text-[13px] whitespace-pre-line text-a-muted">
            <span className="font-medium text-a-text">Internal: </span>
            {internal}
          </p>
        )}

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-wide text-a-muted uppercase">
            <Users className="size-3.5" aria-hidden /> Team
          </p>
          {people.length === 0 ? (
            <p className="text-[13px] text-a-warning">Nobody assigned yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {people.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  {p.s.photo?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small public avatar
                    <img src={p.s.photo.url} alt="" className="size-6 rounded-full object-cover" />
                  ) : (
                    <Avatar name={p.s.name} size="sm" />
                  )}
                  <span className="font-medium">{p.s.name}</span>
                  <StatusBadge map={TASK_STATUS} value={p.status} />
                  {p.status === "BLOCKED" && p.holdReason && <span className="text-a-danger">{p.holdReason}</span>}
                  {p.status === "COMPLETED" && p.completionNote && <span className="text-a-muted">“{p.completionNote}”</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {refs.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium tracking-wide text-a-muted uppercase">Reference images</p>
            <div className="flex flex-wrap gap-2">
              {refs.map(({ id, p }) => (
                <span key={id} className="relative">
                  <a href={p.src} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed links */}
                    <img src={p.src} alt={p.alt} className="size-16 rounded-md border border-a-border object-cover" />
                  </a>
                  {editable && <RemoveReferenceButton taskId={t.id} mediaId={id} />}
                </span>
              ))}
            </div>
          </div>
        )}
        {proof.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium tracking-wide text-a-muted uppercase">Completion photos</p>
            <div className="flex flex-wrap gap-2">
              {proof.map((p) => (
                <a key={p.src} href={p.src} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed links */}
                  <img src={p.src} alt={p.alt} className="size-16 rounded-md border border-a-border object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-a-muted hover:text-a-text">
              <History className="size-3.5" aria-hidden /> History ({history.length})
            </summary>
            <ol className="mt-2 space-y-1 border-l border-a-border pl-3 text-xs">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="text-a-muted">{fmtDateTime(h.createdAt)} · </span>
                  {h.kind === "STATUS" ? (
                    <>
                      {h.s?.name ?? h.a?.fullName ?? "Planner"} → <span className="font-medium">{TASK_STATUS[h.toStatus ?? ""]?.label ?? h.toStatus}</span>
                      {h.note && <span className="text-a-muted"> — {h.note}</span>}
                    </>
                  ) : (
                    <>
                      {h.s?.name} {KIND[h.kind]}
                      {h.a && <span className="text-a-muted"> by {h.a.fullName}</span>}
                    </>
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>

      {editable && (
        <footer className="flex flex-wrap items-center gap-1.5 border-t border-a-border px-3 py-2">
          <AssignButton taskId={t.id} title={t.title} staff={staff} selected={people.map((p) => p.staffId)} />
          <TaskFormButton
            bookingId={bookingId}
            staff={staff}
            eventDate={eventDate}
            variant="ghost"
            values={{
              id: t.id,
              title: t.title,
              description: t.description,
              staffInstructions: t.staffInstructions,
              internalNotes: internal,
              startDate: t.startDate,
              dueAt: t.dueAt,
              priority: t.priority,
              staffIds: people.map((p) => p.staffId),
            }}
          />
          <InternalNotesButton taskId={t.id} notes={internal} />
          <ReferenceUpload taskId={t.id} />
          <span className="ml-auto flex gap-1">
            <DuplicateTaskButton id={t.id} />
            <DeleteWorkTaskButton id={t.id} title={t.title} />
          </span>
        </footer>
      )}
      {!editable && planner && people.length === 0 && (
        <p className="flex items-center gap-1.5 border-t border-a-border px-4 py-2 text-xs text-a-muted">
          <MapPin className="size-3" aria-hidden /> Assignment opens once the booking is confirmed.
        </p>
      )}
    </article>
  );
}
