import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Clock, Hourglass, ListChecks, MapPin, Phone, Printer, UsersRound } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage, type SessionUser } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, fmtDay, fmtTime, serverNow, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dayLabel, proofPhotos } from "@/server/work";
import { FilterSelect } from "@/components/admin/interactive";
import { EVENT_STATUS, PRIORITY, StatusBadge, TASK_STATUS } from "@/components/admin/status";
import { Badge, Card, EmptyState, Kpi, LinkButton, Notice, PageHeader, Tabs } from "@/components/admin/ui";
import { WorkTaskActions } from "./WorkClient";
import { isHeld, taskLabel } from "@/lib/task-status";

export const metadata: Metadata = { title: "My work" };

const DAYS = 14;
/** YYYY-MM-DD of a moment, in Nepal time. */
const npDay = (d: Date) => new Date(d.getTime() + 345 * 60_000).toISOString().slice(0, 10);
const mapLink = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

type EventLite = { id: string; title: string; eventDate: string; startTime: string | null; endTime: string | null; venue: string | null; venueAddress: string | null; status: string; startAt: Date };
type TaskEvent = { id: string; title: string; eventDate: string; eventType: string | null; venue: string | null; b: { number: string } | null; c: { name: string } | null };
type Mine = { id: string; status: string; holdReason: string | null; completionNote: string | null; proofMediaIds: string[]; completedAt: Date | null };
/** A task as the viewer sees it: their own part of it (status, note, photos) when they're on it. */
type TaskRow = Row<typeof schema.eventTasks> & { e: TaskEvent | null; mine: Mine | null };
type Shift = EventLite & { role: string | null; customer: { name: string; phone: string | null } | null };

const TASK_EVENT = "e:events(id,title,eventDate:event_date,eventType:event_type,venue,b:bookings(number),c:customers(name))";
const MINE_COLS = "id,status,holdReason:hold_reason,completionNote:completion_note,proofMediaIds:proof_media_ids,completedAt:completed_at";

/** The viewer's own status on a task (their assignment), else the task's. */
const statusOf = (t: TaskRow) => t.mine?.status ?? t.status;
const doneOf = (t: TaskRow) => statusOf(t) === "COMPLETED";

/**
 * Tasks for one person: their active assignments plus older personal tasks given to their login.
 * `since` limits completed work to recent days (schedule); null returns everything (history).
 */
async function loadMyTasks(staffId: string | null, userId: string | null, opts: { since: Date | null; completedOnly?: boolean; limit?: number }) {
  const limit = opts.limit ?? 300;
  const [assigned, personal] = await Promise.all([
    staffId
      ? many<Mine & { t: Row<typeof schema.eventTasks> & { e: TaskEvent | null } }>(
          (() => {
            let q = adminDb
              .from(tbl(schema.eventTaskAssignees))
              .select(`${MINE_COLS},t:event_tasks!inner(${cols(schema.eventTasks)},${TASK_EVENT})`)
              .eq("staff_id", staffId)
              .is("removed_at", null);
            if (opts.completedOnly) q = q.eq("status", "COMPLETED");
            else if (opts.since) q = q.or(`status.neq.COMPLETED,completed_at.gte.${opts.since.toISOString()}`);
            return q.order("completed_at", { ascending: false, nullsFirst: true }).limit(limit);
          })(),
        )
      : [],
    userId
      ? many<Row<typeof schema.eventTasks> & { e: TaskEvent | null }>(
          (() => {
            let q = adminDb.from(tbl(schema.eventTasks)).select(`${cols(schema.eventTasks)},${TASK_EVENT}`).eq("assignee_user_id", userId);
            if (opts.completedOnly) q = q.eq("status", "COMPLETED");
            else if (opts.since) q = q.or(`status.neq.COMPLETED,completed_at.gte.${opts.since.toISOString()}`);
            return q.order("completed_at", { ascending: false, nullsFirst: true }).limit(limit);
          })(),
        )
      : [],
  ]);
  const out = new Map<string, TaskRow>();
  for (const { t, ...mine } of assigned) out.set(t.id, { ...t, mine });
  for (const t of personal) if (!out.has(t.id)) out.set(t.id, { ...t, mine: null });
  return [...out.values()];
}

export default async function MyWorkPage({ searchParams }: PageProps<"/admin/my-work">) {
  const user = await requirePage();
  if (!user.permissions.has("events.view") && !user.permissions.has("tasks.update")) await requirePage("tasks.update");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const planner = user.permissions.has("events.update");
  const view = planner && str("view") === "team" ? "team" : str("view") === "history" ? "history" : "mine";

  const staff = planner ? await many<{ value: string; label: string; role: string | null }>(adminDb.from(tbl(schema.staff)).select("value:id,label:name,role").eq("active", true).is("archived_at", null).order("name")) : [];
  const viewing = planner && str("staff") && staff.some((s) => s.value === str("staff")) ? str("staff") : null;
  const staffQuery = viewing ? `&staff=${viewing}` : "";

  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kathmandu" }).format(new Date())}
        title={view === "team" ? "Team schedule" : view === "history" ? "Work history" : `Hello, ${user.name.split(" ")[0]}`}
        description={
          view === "team"
            ? "Who is working where over the next week. Open a person to see their full schedule."
            : view === "history"
              ? "Everything you've finished, newest first."
              : "Your events and tasks, day by day. Accept new work, start it when you begin and mark it done with a photo when you finish."
        }
        actions={planner && view !== "team" && <FilterSelect param="staff" label="Team member" allLabel="Me" options={staff} />}
      />
      <Tabs
        active={view}
        items={[
          { key: "mine", label: "My tasks", href: `/admin/my-work${viewing ? `?staff=${viewing}` : ""}` },
          { key: "history", label: "History", href: `/admin/my-work?view=history${staffQuery}` },
          ...(planner ? [{ key: "team", label: "Team board", href: "/admin/my-work?view=team" }] : []),
        ]}
      />
      {view === "team" ? <TeamBoard staff={staff} /> : view === "history" ? <WorkHistory user={user} viewing={viewing} staffNames={staff} /> : <Schedule viewing={viewing} user={user} staffNames={staff} />}
    </>
  );
}

async function who(user: SessionUser, viewing: string | null) {
  const staffId = viewing ?? user.staffId;
  const userId = viewing ? ((await maybe<{ id: string }>(adminDb.from(tbl(schema.profiles)).select("id").eq("staff_id", viewing).limit(1)))?.id ?? null) : user.id;
  return { staffId, userId };
}

/* ───────── One person's schedule ───────── */

async function Schedule({ viewing, user, staffNames }: { viewing: string | null; user: SessionUser; staffNames: { value: string; label: string }[] }) {
  const { staffId, userId } = await who(user, viewing);
  const name = viewing ? staffNames.find((s) => s.value === viewing)!.label : null;
  const canEvents = user.permissions.has("events.view");

  const today = todayISO();
  const todayStart = new Date(`${today}T00:00:00+05:45`);
  const last = todayISO(DAYS - 1);

  const [tasks, shifts, totals] = await Promise.all([
    loadMyTasks(staffId, userId, { since: new Date(todayStart.getTime() - 86_400_000) }),
    staffId
      ? many<{ role: string | null; e: EventLite & { c: { name: string; phone: string | null } | null } }>(
          adminDb
            .from(tbl(schema.staffAssignments))
            .select("role,e:events!inner(id,title,eventDate:event_date,startTime:start_time,endTime:end_time,venue,venueAddress:venue_address,status,startAt:start_at,c:customers(name,phone))")
            .eq("staff_id", staffId)
            .gte("e.event_date", todayISO(-1))
            .lte("e.event_date", last)
            .neq("e.status", "CANCELLED"),
        ).then((rows) => rows.map(({ role, e: { c, ...e } }): Shift => ({ ...e, role, customer: c })))
      : [],
    // All-time counts of this person's assignments, for the overview
    staffId ? many<{ status: string }>(adminDb.from(tbl(schema.eventTaskAssignees)).select("status").eq("staff_id", staffId).is("removed_at", null).limit(5000)) : [],
  ]);

  const photos = await proofPhotos(tasks.flatMap((t) => t.mine?.proofMediaIds ?? t.proofMediaIds));
  const open = tasks.filter((t) => !doneOf(t));
  const overdue = open.filter((t) => t.dueAt && t.dueAt < todayStart);
  const dayOf = (t: TaskRow) => (t.dueAt ? npDay(t.dueAt) : null);
  const days = Array.from({ length: DAYS }, (_, i) => todayISO(i));
  const later = open.filter((t) => (dayOf(t) ?? "") > last);
  const undated = open.filter((t) => !t.dueAt);
  const upcomingEvents = new Set([...shifts.filter((s) => s.eventDate >= today).map((s) => s.id), ...open.filter((t) => t.e && t.e.eventDate >= today).map((t) => t.e!.id)]).size;
  const count = (...s: string[]) => totals.filter((t) => s.includes(t.status)).length + tasks.filter((t) => !t.mine && s.includes(t.status)).length;

  if (!staffId && !userId) return null;

  return (
    <div className="space-y-6">
      {!viewing && !user.staffId && (
        <Notice tone="warning" title="Your login isn't linked to a team member">
          Work assigned to you won&apos;t show here until an admin links your login (Users → Team member).
        </Notice>
      )}
      {name && <Notice title={`Viewing ${name}’s work`}>{userId ? "They see this same page when they sign in." : "They don't have a login yet — invite them from Users so they can see their work."}</Notice>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Assigned" value={totals.length + tasks.filter((t) => !t.mine).length} icon={ClipboardList} />
        <Kpi label="Pending" value={count("TODO", "ACCEPTED")} icon={ListChecks} hint={count("TODO") ? `${count("TODO")} to accept` : undefined} />
        <Kpi label="In progress" value={count("IN_PROGRESS")} icon={Hourglass} hint={count("BLOCKED") + count("WAITING_MATERIALS") ? `${count("BLOCKED") + count("WAITING_MATERIALS")} on hold or waiting` : undefined} />
        <Kpi label="Completed" value={count("COMPLETED")} icon={CheckCircle2} />
        <Kpi label="Upcoming events" value={upcomingEvents} icon={CalendarDays} />
        <Kpi label="Overdue" value={overdue.length} icon={AlertTriangle} hint={overdue.length ? "Finish these first" : "All caught up"} />
      </div>

      {overdue.length > 0 && (
        <DaySection title="Overdue" tone="danger" count={overdue.length}>
          <TaskList tasks={overdue} photos={photos} showDate />
        </DaySection>
      )}

      {days.map((day, i) => {
        const dayTasks = tasks.filter((t) => dayOf(t) === day && !(!doneOf(t) && t.dueAt && t.dueAt < todayStart));
        const dayShifts = shifts.filter((s) => s.eventDate === day);
        if (!dayTasks.length && !dayShifts.length) return null;
        const title = i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmtDay(day);
        return (
          <DaySection key={day} title={title} sub={i < 2 ? fmtDay(day) : undefined} tone={i === 0 ? "accent" : undefined} count={dayTasks.filter((t) => !doneOf(t)).length}>
            {dayShifts.map((s) => (
              <ShiftCard key={s.id} shift={s} canEvents={canEvents} />
            ))}
            {dayTasks.length > 0 && <TaskList tasks={dayTasks} photos={photos} />}
          </DaySection>
        );
      })}

      {later.length > 0 && (
        <DaySection title="Later" count={later.length}>
          <TaskList tasks={later} photos={photos} showDate />
        </DaySection>
      )}
      {undated.length > 0 && (
        <DaySection title="No deadline" count={undated.length}>
          <TaskList tasks={undated} photos={photos} />
        </DaySection>
      )}

      {!tasks.length && !shifts.length && (
        <Card>
          <EmptyState icon={ClipboardList} title="Nothing scheduled">
            No events or tasks in the next two weeks. New work shows up here — and in your notifications and email — as soon as it&apos;s assigned.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}

/* ───────── History ───────── */

async function WorkHistory({ user, viewing, staffNames }: { user: SessionUser; viewing: string | null; staffNames: { value: string; label: string }[] }) {
  const { staffId, userId } = await who(user, viewing);
  const tasks = (await loadMyTasks(staffId, userId, { since: null, completedOnly: true, limit: 500 })).sort(
    (a, b) => (b.mine?.completedAt ?? b.completedAt ?? new Date(0)).getTime() - (a.mine?.completedAt ?? a.completedAt ?? new Date(0)).getTime(),
  );
  const name = viewing ? staffNames.find((s) => s.value === viewing)?.label : null;
  if (!tasks.length)
    return (
      <Card>
        <EmptyState icon={CheckCircle2} title="No finished work yet">
          {name ? `${name} hasn't completed any tasks yet.` : "Tasks you complete are kept here."}
        </EmptyState>
      </Card>
    );
  const months = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const at = t.mine?.completedAt ?? t.completedAt;
    const key = at ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Kathmandu" }).format(at) : "Earlier";
    months.set(key, [...(months.get(key) ?? []), t]);
  }
  return (
    <div className="space-y-6">
      <p className="text-[13px] text-a-muted">
        {tasks.length} task{tasks.length === 1 ? "" : "s"} completed{name ? ` by ${name}` : ""}.
      </p>
      {[...months].map(([month, list]) => (
        <section key={month}>
          <h2 className="mb-2 font-serif text-xl font-medium">{month}</h2>
          <Card bodyClassName="p-0">
            <ul className="divide-y divide-a-border">
              {list.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/my-work/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-a-hover">
                    <CheckCircle2 className="size-4 shrink-0 text-a-success" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t.title}</span>
                      <span className="block truncate text-xs text-a-muted">
                        {[t.e?.b?.number, t.e?.title, t.e && fmtDate(t.e.eventDate)].filter(Boolean).join(" · ")}
                        {(t.mine?.completionNote ?? t.completionNote) && ` · “${t.mine?.completionNote ?? t.completionNote}”`}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-a-muted">{fmtDateTime(t.mine?.completedAt ?? t.completedAt)}</span>
                    <ChevronRight className="size-4 shrink-0 text-a-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}

function DaySection({ title, sub, count, tone, children }: { title: string; sub?: string; count?: number; tone?: "accent" | "danger"; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={cn("mb-2 flex items-baseline gap-2 font-serif text-xl font-medium", tone === "danger" && "text-a-danger")}>
        {title}
        {sub && <span className="font-sans text-[13px] font-normal text-a-muted">{sub}</span>}
        {!!count && <Badge tone={tone === "danger" ? "danger" : tone === "accent" ? "accent" : "neutral"}>{count} open</Badge>}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ShiftCard({ shift: s, canEvents }: { shift: Shift; canEvents: boolean }) {
  const time = [s.startTime && s.startTime.slice(0, 5), s.endTime && s.endTime.slice(0, 5)].filter(Boolean).join(" – ");
  const place = [s.venue, s.venueAddress].filter(Boolean).join(", ");
  return (
    <div className="rounded-xl border border-a-border border-l-4 border-l-a-accent bg-a-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-a-gold uppercase">Event{s.role ? ` · you're ${s.role}` : ""}</p>
          {canEvents ? (
            <Link href={`/admin/events/${s.id}`} className="text-base font-semibold hover:underline">
              {s.title}
            </Link>
          ) : (
            <p className="text-base font-semibold">{s.title}</p>
          )}
          <ul className="mt-1.5 space-y-1 text-[13px] text-a-muted">
            <li className="flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              Setup from {fmtTime(s.startAt)}
              {time && ` · guests ${time}`}
            </li>
            {place && (
              <li className="flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <a href={mapLink(place)} target="_blank" rel="noreferrer" className="hover:text-a-text hover:underline">
                  {place}
                </a>
              </li>
            )}
            {s.customer && (
              <li className="flex items-center gap-1.5">
                <Phone className="size-3.5 shrink-0" aria-hidden />
                {s.customer.name}
                {s.customer.phone && (
                  <a href={`tel:${s.customer.phone}`} className="font-medium text-a-text hover:underline">
                    {s.customer.phone}
                  </a>
                )}
              </li>
            )}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.status !== "PLANNING" && <StatusBadge map={EVENT_STATUS} value={s.status} />}
          {canEvents && (
            <LinkButton href={`/admin/print/event/${s.id}`} size="sm" icon={Printer}>
              Day sheet
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskList({ tasks, photos, showDate }: { tasks: TaskRow[]; photos: Map<string, { src: string; alt: string }>; showDate?: boolean }) {
  const now = serverNow();
  return (
    <div className="space-y-3">
      {tasks.map((t) => {
        const status = statusOf(t);
        const done = status === "COMPLETED";
        const late = !done && t.dueAt && t.dueAt.getTime() < now;
        const pics = (t.mine?.proofMediaIds ?? t.proofMediaIds).map((id) => photos.get(id)).filter((p): p is { src: string; alt: string } => !!p);
        const hold = t.mine ? t.mine.holdReason : t.blockedReason;
        const note = t.mine ? t.mine.completionNote : t.completionNote;
        return (
          <article key={t.id} className={cn("rounded-xl border border-a-border bg-a-surface", late && "border-l-4 border-l-a-danger", done && "bg-a-subtle/40")}>
            <Link href={`/admin/my-work/${t.id}`} className="block space-y-2 px-4 pt-4 pb-2 hover:bg-a-hover/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {t.e && (
                    <p className="text-xs font-semibold tracking-wide text-a-gold uppercase">
                      {[t.e.b?.number, t.e.eventType?.replace(/-/g, " ")].filter(Boolean).join(" · ") || "Event"}
                    </p>
                  )}
                  <h3 className={cn("text-[17px] leading-snug font-semibold", done && "text-a-muted line-through")}>{t.title}</h3>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge map={TASK_STATUS} value={status} />
                  {["HIGH", "URGENT"].includes(t.priority) && !done && <StatusBadge map={PRIORITY} value={t.priority} />}
                </span>
              </div>
              <ul className="grid gap-x-4 gap-y-1 text-[13px] text-a-muted sm:grid-cols-2">
                {t.e && (
                  <li className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                    {t.e.title} · {fmtDate(t.e.eventDate)}
                  </li>
                )}
                {t.e?.venue && (
                  <li className="flex items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    {t.e.venue}
                  </li>
                )}
                {t.dueAt && (
                  <li className={cn("flex items-center gap-1.5", late && "font-medium text-a-danger")}>
                    <Clock className="size-3.5 shrink-0" aria-hidden />
                    {late ? "Was due " : "Due "}
                    {showDate ? `${fmtDay(t.dueAt)}, ` : ""}
                    {fmtTime(t.dueAt)}
                  </li>
                )}
                {t.e?.c && (
                  <li className="flex items-center gap-1.5">
                    <UsersRound className="size-3.5 shrink-0" aria-hidden />
                    Client: {t.e.c.name}
                  </li>
                )}
                {t.workDay != null && <li>{dayLabel(t.workDay)}</li>}
              </ul>
            </Link>
            <div className="space-y-2 px-4 pb-4">
              {isHeld(status) && hold && <p className="rounded-md bg-a-danger-soft px-3 py-2 text-[13px] text-a-danger">{taskLabel(status)}: {hold}</p>}
              {done && note && <p className="text-[13px] text-a-muted">“{note}”</p>}
              {pics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pics.map((p) => (
                    <a key={p.src} href={p.src} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed links */}
                      <img src={p.src} alt={p.alt} className="size-16 rounded-md border border-a-border object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <WorkTaskActions id={t.id} title={t.title} status={status} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ───────── Team board (planners) ───────── */

async function TeamBoard({ staff }: { staff: { value: string; label: string; role: string | null }[] }) {
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => todayISO(i));
  const todayStart = new Date(`${today}T00:00:00+05:45`);
  const end = new Date(`${todayISO(7)}T00:00:00+05:45`).toISOString();
  const [shifts, tasks, linked] = await Promise.all([
    many<{ staffId: string; e: { id: string; title: string; eventDate: string } }>(
      adminDb
        .from(tbl(schema.staffAssignments))
        .select("staffId:staff_id,e:events!inner(id,title,eventDate:event_date)")
        .gte("e.event_date", today)
        .lte("e.event_date", days[6]!)
        .neq("e.status", "CANCELLED"),
    ),
    // Open work per person — every assignment, not just the first assignee on a task
    many<{ staffId: string; t: { dueAt: Date } }>(
      adminDb
        .from(tbl(schema.eventTaskAssignees))
        .select("staffId:staff_id,t:event_tasks!inner(dueAt:due_at)")
        .is("removed_at", null)
        .neq("status", "COMPLETED")
        .lt("t.due_at", end),
    ).then((rows) => rows.map((r) => ({ staffId: r.staffId, dueAt: r.t.dueAt }))),
    many<{ staffId: string }>(adminDb.from(tbl(schema.profiles)).select("staffId:staff_id").not("staff_id", "is", null).eq("active", true)),
  ]);
  const hasLogin = new Set(linked.map((l) => l.staffId));
  if (!staff.length)
    return (
      <Card>
        <EmptyState icon={UsersRound} title="No team members yet" action={<LinkButton href="/admin/staff">Add team members</LinkButton>}>
          Add your team under Staff, then assign them to events.
        </EmptyState>
      </Card>
    );

  return (
    <Card bodyClassName="p-0 overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="border-b border-a-border text-left text-xs text-a-muted">
            <th className="px-4 py-2 font-medium">Team member</th>
            {days.map((d, i) => (
              <th key={d} className={cn("px-2 py-2 font-medium", i === 0 && "text-a-text")}>
                {i === 0 ? "Today" : fmtDay(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-a-border">
          {staff.map((s) => {
            const late = tasks.filter((t) => t.staffId === s.value && t.dueAt < todayStart).length;
            return (
              <tr key={s.value} className="align-top">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/my-work?staff=${s.value}`} className="font-medium hover:underline">
                    {s.label}
                  </Link>
                  <p className="text-xs text-a-muted">
                    {s.role ?? "Team"}
                    {!hasLogin.has(s.value) && " · no login"}
                  </p>
                  {late > 0 && <p className="text-xs font-medium text-a-danger">{late} overdue</p>}
                </td>
                {days.map((d) => {
                  const ev = shifts.filter((x) => x.staffId === s.value && x.e.eventDate === d);
                  const n = tasks.filter((t) => t.staffId === s.value && npDay(t.dueAt) === d).length;
                  return (
                    <td key={d} className="px-2 py-2.5">
                      {ev.map((x) => (
                        <Link key={x.e.id} href={`/admin/events/${x.e.id}?tab=team`} className="mb-1 block truncate rounded bg-a-accent-soft px-1.5 py-0.5 text-xs font-medium text-a-accent hover:underline" title={x.e.title}>
                          {x.e.title}
                        </Link>
                      ))}
                      {n > 0 && (
                        <span className="text-xs text-a-muted">
                          {n} task{n === 1 ? "" : "s"}
                        </span>
                      )}
                      {ev.length > 1 && <AlertTriangle className="size-3.5 text-a-danger" aria-label="Two events this day" />}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
