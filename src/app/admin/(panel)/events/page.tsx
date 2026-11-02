import type { Metadata } from "next";
import Link from "next/link";
import { PartyPopper, Plus } from "lucide-react";
import { adminDb, all, cols, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDay, num, todayISO } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { EMPTY_PROGRESS, progressBy } from "@/lib/progress";
import { eventTypeName, eventTypeOptions, userOptions } from "@/server/lookups";
import CalendarButton from "@/components/admin/CalendarModal";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { EVENT_STATUS, options, StatusBadge } from "@/components/admin/status";
import { Card, EmptyState, LinkButton, PageHeader, Pagination, Table, Tabs, Td, Th, Toolbar } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Events" };

const STATUSES = ["PLANNING", "READY", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
const VIEWS = ["upcoming", "in-progress", "overdue", "completed", "past", "all"] as const;
type View = (typeof VIEWS)[number];
const NO_MATCH = "00000000-0000-0000-0000-000000000000";

type EventRow = Row<typeof schema.events> & { customer: { id: string; name: string } | null; m: { fullName: string } | null };
type TaskLite = { eventId: string; status: string; dueAt: string | null; countsTowardProgress: boolean };

/** Events with required, unfinished work past its deadline (work in review isn't late: the team has finished). */
async function overdueEventIds(nowIso: string) {
  const late = await all<{ eventId: string }>(() =>
    adminDb
      .from(tbl(schema.eventTasks))
      .select("eventId:event_id")
      .not("event_id", "is", null)
      .lt("due_at", nowIso)
      .not("status", "in", "(COMPLETED,CANCELLED,REVIEW)")
      .eq("counts_toward_progress", true)
      .order("id"),
  );
  return [...new Set(late.map((t) => t.eventId))];
}

export default async function EventsPage({ searchParams }: PageProps<"/admin/events">) {
  const user = await requirePage("events.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 30);
  const when = str("when") ?? "";
  const view: View = (VIEWS as readonly string[]).includes(when) ? (when as View) : "upcoming";
  const status = str("status");
  const type = str("type");
  const manager = str("manager");
  const today = todayISO();
  const nowIso = new Date().toISOString();

  const lateIds = view === "overdue" ? await overdueEventIds(nowIso) : [];

  let query = adminDb
    .from(tbl(schema.events))
    .select(`${cols(schema.events)},customer:customers(id,name),m:profiles!manager_id(fullName:full_name)`, { count: "exact" })
    .is("archived_at", null);
  if (view === "upcoming") query = query.gte("event_date", today);
  if (view === "past") query = query.lt("event_date", today);
  if (view === "in-progress") query = query.eq("status", "IN_PROGRESS");
  if (view === "completed") query = query.eq("status", "COMPLETED");
  if (view === "overdue") query = query.in("id", lateIds.length ? lateIds : [NO_MATCH]).neq("status", "CANCELLED");
  if (status && (STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  else if (view === "upcoming") query = query.neq("status", "CANCELLED");
  if (type) query = query.eq("event_type", type);
  if (manager === "none") query = query.is("manager_id", null);
  else if (manager && /^[0-9a-f-]{36}$/i.test(manager)) query = query.eq("manager_id", manager);
  if (q) {
    const term = pgrstValue(likeTerm(q));
    query = query.or(`title.ilike.${term},venue.ilike.${term}`);
  }
  const ascending = view === "upcoming" || view === "in-progress" || view === "overdue";
  const [{ rows, total }, types, managers] = await Promise.all([
    paged<EventRow>(query.order("event_date", { ascending }).order("start_at").range(offset, offset + pageSize - 1)),
    eventTypeOptions(),
    userOptions(),
  ]);
  const ids = rows.map((r) => r.id);
  const [tasks, workOrders, team] = ids.length
    ? await Promise.all([
        all<TaskLite>(() =>
          adminDb
            .from(tbl(schema.eventTasks))
            .select("eventId:event_id,status,dueAt:due_at,countsTowardProgress:counts_toward_progress")
            .in("event_id", ids)
            .order("id"),
        ),
        all<{ eventId: string }>(() => adminDb.from(tbl(schema.workOrders)).select("eventId:event_id").in("event_id", ids).neq("status", "CANCELLED").order("id")),
        all<{ eventId: string }>(() => adminDb.from(tbl(schema.staffAssignments)).select("eventId:event_id").in("event_id", ids).order("id")),
      ])
    : [[], [], []];
  const progress = progressBy(tasks, (t) => t.eventId);
  const countBy = (list: { eventId: string }[]) => list.reduce((m, r) => m.set(r.eventId, (m.get(r.eventId) ?? 0) + 1), new Map<string, number>());
  const woCount = countBy(workOrders);
  const teamCount = countBy(team);
  const filtered = !!(q || status || type || manager);

  return (
    <>
      <PageHeader
        title="Events"
        description="Every booked event, its work orders and how far the team has got."
        actions={
          <>
            {user.permissions.has("events.view") && <CalendarButton />}
            {user.permissions.has("bookings.create") && (
              <LinkButton href="/admin/bookings/new" variant="primary" icon={Plus}>
                New booking
              </LinkButton>
            )}
          </>
        }
      />
      <Tabs
        active={view}
        items={[
          { key: "upcoming", label: "Upcoming", href: "/admin/events" },
          { key: "in-progress", label: "In progress", href: "/admin/events?when=in-progress" },
          { key: "overdue", label: "Overdue work", href: "/admin/events?when=overdue" },
          { key: "completed", label: "Completed", href: "/admin/events?when=completed" },
          { key: "past", label: "Past", href: "/admin/events?when=past" },
          { key: "all", label: "All", href: "/admin/events?when=all" },
        ]}
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Title or venue" />
          <FilterSelect param="status" label="Status" options={options(STATUSES, EVENT_STATUS)} />
          <FilterSelect param="type" label="Type" options={types} />
          <FilterSelect param="manager" label="Manager" allLabel="Anyone" options={[{ value: "none", label: "No manager" }, ...managers]} />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState
            icon={PartyPopper}
            title={filtered ? "No events match" : view === "overdue" ? "No overdue work" : view === "upcoming" ? "No upcoming events" : "No events"}
          >
            {view === "overdue" && !filtered ? "Every required task is on schedule." : "Events are created with each booking."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Event</Th>
                <Th>Client</Th>
                <Th>Manager</Th>
                <Th>Work orders</Th>
                <Th>Progress</Th>
                <Th>Team</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const p = progress.get(e.id) ?? EMPTY_PROGRESS;
                const people = teamCount.get(e.id) ?? 0;
                const wo = woCount.get(e.id) ?? 0;
                const live = e.status !== "CANCELLED" && e.status !== "COMPLETED";
                const ahead = live && e.eventDate >= today;
                const soon = e.eventDate >= today && e.eventDate <= todayISO(7);
                return (
                  <tr key={e.id} className="hover:bg-a-subtle/60">
                    <Td className={`whitespace-nowrap ${soon ? "font-semibold text-a-gold" : ""}`}>
                      {fmtDay(e.eventDate)}
                      <span className="block text-xs font-normal text-a-muted">{e.eventDate.slice(0, 4)}</span>
                    </Td>
                    <Td>
                      <Link href={`/admin/events/${e.id}`} className="font-medium hover:underline">
                        {e.title}
                      </Link>
                      <span className="block text-xs text-a-muted">
                        {eventTypeName(types, e.eventType)}
                        {e.guestCount ? ` · ${num(e.guestCount)} guests` : ""}
                        {e.venue ? ` · ${e.venue}` : ""}
                      </span>
                    </Td>
                    <Td>{e.customer ? <Link href={`/admin/customers/${e.customer.id}`} className="hover:underline">{e.customer.name}</Link> : "—"}</Td>
                    <Td className={`text-xs ${!e.m && ahead ? "font-medium text-a-warning" : ""}`}>{e.m?.fullName ?? "Not set"}</Td>
                    <Td className="text-xs tabular-nums">{wo || "—"}</Td>
                    <Td className="min-w-40">
                      {p.total ? (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-a-subtle" role="progressbar" aria-label="Required tasks completed" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100}>
                              <div className={`h-full rounded-full ${p.percent === 100 ? "bg-a-success" : "bg-a-gold"}`} style={{ width: `${p.percent}%` }} />
                            </div>
                            <span className="text-xs tabular-nums">{p.percent}%</span>
                          </div>
                          <span className="mt-0.5 block text-xs text-a-muted tabular-nums">
                            {p.done}/{p.total} done · {p.open} pending
                            {p.overdue > 0 && <span className="font-medium text-a-danger"> · {p.overdue} overdue</span>}
                          </span>
                        </>
                      ) : (
                        <span className={`text-xs ${ahead ? "text-a-warning" : "text-a-muted"}`}>No tasks yet</span>
                      )}
                    </Td>
                    <Td className={`text-xs ${people === 0 && ahead ? "font-medium text-a-warning" : ""}`}>{people || "None"}</Td>
                    <Td>
                      <StatusBadge map={EVENT_STATUS} value={e.status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/events" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
