import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Clock, Hourglass, MapPin, PauseCircle, Users } from "lucide-react";
import { adminDb, many, schema, tbl } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, serverNow, todayISO } from "@/lib/format";
import { first, listParams } from "@/lib/list";
import { cn } from "@/lib/utils";
import { assigneesFor, WORK_BOOKING_STATUSES } from "@/server/assignments";
import { eventTypeName, eventTypeOptions, staffOptions } from "@/server/lookups";
import { DateRangeFilter, FilterSelect, SearchBox } from "@/components/admin/interactive";
import { BOOKING_STATUS, options, PRIORITY, StatusBadge, TASK_STATUS } from "@/components/admin/status";
import { Badge, Card, EmptyState, Kpi, LinkButton, PageHeader, ProgressBar, Tabs, Toolbar } from "@/components/admin/ui";
import { isHeld, TASK_STATUSES } from "@/lib/task-status";

export const metadata: Metadata = { title: "Work management" };

type EventLite = { id: string; title: string; eventType: string | null; eventDate: string; venue: string | null; status: string };
type BookingRow = { id: string; number: string; status: string; q: { status: string } | null; e: EventLite | EventLite[] | null };
type TaskLite = { id: string; eventId: string; title: string; status: string; priority: string; dueAt: string | null; assigneeUserId: string | null };

const STATUS_FILTER = ["PENDING", ...TASK_STATUSES] as const;

export default async function WorkManagementPage({ searchParams }: PageProps<"/admin/work">) {
  const user = await requirePage("events.view");
  const { q, str } = listParams(await searchParams);
  const view = str("view") === "past" ? "past" : str("view") === "all" ? "all" : "upcoming";
  const today = todayISO();
  const from = str("from") && /^\d{4}-\d{2}-\d{2}$/.test(str("from")!) ? str("from")! : null;
  const to = str("to") && /^\d{4}-\d{2}-\d{2}$/.test(str("to")!) ? str("to")! : null;
  const staffFilter = str("staff") ?? null;
  const statusFilter = (STATUS_FILTER as readonly string[]).includes(str("status") ?? "") ? str("status")! : null;
  const priorityFilter = ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(str("priority") ?? "") ? str("priority")! : null;
  const typeFilter = str("type") ?? null;

  let query = adminDb
    .from(tbl(schema.bookings))
    .select("id,number,status,q:quotations(status),e:events!inner(id,title,eventType:event_type,eventDate:event_date,venue,status)")
    .in("status", [...WORK_BOOKING_STATUSES])
    .is("archived_at", null);
  if (view === "upcoming") query = query.gte("e.event_date", todayISO(-1));
  if (view === "past") query = query.lt("e.event_date", today);
  if (from) query = query.gte("e.event_date", from);
  if (to) query = query.lte("e.event_date", to);
  if (typeFilter) query = query.eq("e.event_type", typeFilter);

  const [bookingsRaw, types, staff] = await Promise.all([many<BookingRow>(query.limit(300)), eventTypeOptions(), staffOptions()]);
  // Only bookings the client has approved (accepted quotation, or booked directly)
  let bookings = bookingsRaw
    .map((b) => ({ ...b, event: first(b.e)! }))
    .filter((b) => b.event && (!b.q || b.q.status === "ACCEPTED"))
    .sort((a, b) => (view === "past" ? b.event.eventDate.localeCompare(a.event.eventDate) : a.event.eventDate.localeCompare(b.event.eventDate)));
  if (q) {
    const term = q.toLowerCase();
    bookings = bookings.filter((b) => b.number.toLowerCase().includes(term) || b.event.title.toLowerCase().includes(term));
  }

  const eventIds = bookings.map((b) => b.event.id);
  const tasks: TaskLite[] = [];
  for (let i = 0; i < eventIds.length; i += 150)
    tasks.push(
      ...(await many<TaskLite>(
        adminDb
          .from(tbl(schema.eventTasks))
          .select("id,eventId:event_id,title,status,priority,dueAt:due_at,assigneeUserId:assignee_user_id")
          .in("event_id", eventIds.slice(i, i + 150))
          .order("position"),
      )),
    );
  const people = await assigneesFor(tasks.map((t) => t.id));
  const now = serverNow();
  const isLate = (t: TaskLite) => t.status !== "COMPLETED" && !!t.dueAt && new Date(t.dueAt).getTime() < now;
  const unassigned = (t: TaskLite) => !(people.get(t.id)?.length) && !t.assigneeUserId;

  // Task-level filters narrow the tasks shown — and the bookings to those with a match
  const taskFiltered = !!(staffFilter || statusFilter || priorityFilter);
  const matches = (t: TaskLite) =>
    (!staffFilter || (people.get(t.id) ?? []).some((p) => p.staffId === staffFilter)) &&
    (!statusFilter || (statusFilter === "PENDING" ? unassigned(t) : t.status === statusFilter && !unassigned(t))) &&
    (!priorityFilter || t.priority === priorityFilter);
  const rows = bookings
    .map((b) => {
      const all = tasks.filter((t) => t.eventId === b.event.id);
      return { ...b, all, shown: taskFiltered ? all.filter(matches) : all };
    })
    .filter((b) => !taskFiltered || b.shown.length > 0);

  // Overview across every active job (not narrowed by the filters)
  const activeJobs = bookings.filter((b) => b.status !== "COMPLETED" && b.event.eventDate >= today);
  const activeTasks = tasks.filter((t) => activeJobs.some((b) => b.event.id === t.eventId));
  const kpi = {
    jobs: activeJobs.length,
    assigned: activeTasks.filter((t) => !unassigned(t)).length,
    pending: activeTasks.filter((t) => unassigned(t) || t.status === "TODO" || t.status === "ACCEPTED").length,
    progress: activeTasks.filter((t) => t.status === "IN_PROGRESS").length,
    hold: activeTasks.filter((t) => isHeld(t.status)).length,
    done: activeTasks.filter((t) => t.status === "COMPLETED").length,
    overdue: activeTasks.filter(isLate).length,
    upcoming: activeJobs.filter((b) => b.event.eventDate <= todayISO(14)).length,
  };
  const noPlan = activeJobs.filter((b) => !tasks.some((t) => t.eventId === b.event.id)).length;
  const base = "/admin/work";

  return (
    <>
      <PageHeader
        title="Work management"
        description="Approved bookings, the decoration tasks for each, who is doing them and how far along they are."
        actions={
          user.permissions.has("events.update") && (
            <LinkButton href="/admin/my-work?view=team" icon={Users}>
              Team board
            </LinkButton>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active jobs" value={kpi.jobs} icon={ClipboardList} hint={noPlan ? `${noPlan} without tasks yet` : "All have tasks"} />
        <Kpi label="Assigned tasks" value={kpi.assigned} icon={Users} hint={`${kpi.pending} pending`} />
        <Kpi label="In progress" value={kpi.progress} icon={Hourglass} hint={kpi.hold ? `${kpi.hold} on hold` : undefined} />
        <Kpi label="Completed" value={kpi.done} icon={CheckCircle2} />
        <Kpi label="Overdue" value={kpi.overdue} icon={AlertTriangle} hint={kpi.overdue ? "Past their deadline" : "Nothing late"} />
        <Kpi label="On hold" value={kpi.hold} icon={PauseCircle} />
        <Kpi label="Pending" value={kpi.pending} icon={Clock} hint="Unassigned or not started" />
        <Kpi label="Events in 14 days" value={kpi.upcoming} icon={CalendarDays} />
      </div>

      <Tabs
        active={view}
        items={[
          { key: "upcoming", label: "Upcoming", href: base },
          { key: "past", label: "Past", href: `${base}?view=past` },
          { key: "all", label: "All", href: `${base}?view=all` },
        ]}
      />
      <Card className="mb-4" bodyClassName="p-0">
      <Toolbar>
        <SearchBox placeholder="Booking code or event…" />
        <DateRangeFilter />
        <FilterSelect param="type" label="Event" options={types} />
        <FilterSelect param="staff" label="Staff" options={staff} />
        <FilterSelect param="status" label="Status" options={[{ value: "PENDING", label: "Unassigned" }, ...options([...TASK_STATUSES], TASK_STATUS)]} />
        <FilterSelect param="priority" label="Priority" options={options(["LOW", "MEDIUM", "HIGH", "URGENT"], PRIORITY)} />
      </Toolbar>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardList} title={taskFiltered || q || from || to || typeFilter ? "Nothing matches these filters" : "No approved bookings here"}>
            Bookings appear here once the client has accepted the quotation and the booking is confirmed.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((b) => {
            const done = b.all.filter((t) => t.status === "COMPLETED").length;
            const late = b.all.filter(isLate).length;
            const open = b.all.filter(unassigned).length;
            return (
              <Card key={b.id} bodyClassName="p-0">
                <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wide text-a-gold uppercase">
                      {b.number} · {eventTypeName(types, b.event.eventType)}
                    </p>
                    <Link href={`${base}/${b.id}`} className="font-serif text-lg font-medium hover:underline">
                      {b.event.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-a-muted">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" aria-hidden /> {fmtDate(b.event.eventDate)}
                      </span>
                      {b.event.venue && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden /> {b.event.venue}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge map={BOOKING_STATUS} value={b.status} />
                    {late > 0 && <Badge tone="danger">{late} overdue</Badge>}
                    {open > 0 && <Badge tone="warning">{open} unassigned</Badge>}
                    <LinkButton href={`${base}/${b.id}`} size="sm" variant={b.all.length ? "secondary" : "primary"}>
                      {b.all.length ? "Open work plan" : "Plan the work"}
                    </LinkButton>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="mb-1 flex justify-between text-xs text-a-muted">
                    <span>{b.all.length ? `${done} of ${b.all.length} tasks done` : "No tasks yet"}</span>
                    <span className="tabular-nums">{b.all.length ? Math.round((done / b.all.length) * 100) : 0}%</span>
                  </div>
                  <ProgressBar value={done} max={b.all.length} label={`${b.event.title} progress`} tone={b.all.length && done === b.all.length ? "success" : late ? "warning" : "accent"} />
                </div>
                {b.shown.length > 0 && (
                  <ul className="grid gap-x-6 border-t border-a-border px-4 py-2 text-[13px] sm:grid-cols-2">
                    {b.shown.map((t) => {
                      const team = people.get(t.id) ?? [];
                      return (
                        <li key={t.id} className="flex items-center justify-between gap-2 py-1">
                          <span className="min-w-0 truncate">
                            <span className={cn(t.status === "COMPLETED" && "text-a-muted line-through")}>{t.title}</span>
                            <span className="text-xs text-a-muted"> · {team.length ? team.map((p) => p.s.name.split(" ")[0]).join(", ") : t.assigneeUserId ? "assigned" : "nobody"}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            {isLate(t) && <Badge tone="danger">Late</Badge>}
                            {unassigned(t) ? <Badge tone="warning">Pending</Badge> : <StatusBadge map={TASK_STATUS} value={t.status} />}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
