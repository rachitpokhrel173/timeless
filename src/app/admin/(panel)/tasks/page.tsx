import type { Metadata } from "next";
import Link from "@/components/admin/Link";
import { redirect } from "next/navigation";
import { ListTodo } from "lucide-react";
import { adminDb, all, cols, many, paged, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { staffOptions, userOptions } from "@/server/lookups";
import { assigneesFor, taskIdsForStaff } from "@/server/assignments";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { options, PRIORITY, StatusBadge, TASK_STATUS } from "@/components/admin/status";
import { Badge, Card, EmptyState, hrefWith, PageHeader, Pagination, Table, Tabs, Td, Th, Toolbar } from "@/components/admin/ui";
import { DeleteTaskButton, TaskButton, TaskCheck, TaskStatusSelect } from "../events/EventClient";
import { ReviewButtons } from "../staff/StaffClient";
import { RequiredToggle } from "./TasksBoard";
import { OPEN_TASK_STATUSES, TASK_STATUSES, type TaskStatus } from "@/lib/task-status";

export const metadata: Metadata = { title: "Tasks" };

type TaskRow = Row<typeof schema.eventTasks> & {
  e: { id: string; title: string; eventDate: string } | null;
  w: { id: string; title: string } | null;
  s: { name: string } | null;
  u: { fullName: string } | null;
};

const VIEWS = ["open", "unassigned", "review", "overdue", "mine", "done"] as const;
type View = (typeof VIEWS)[number];
const NO_MATCH = "00000000-0000-0000-0000-000000000000";
const idList = (ids: string[]) => `(${(ids.length ? ids : [NO_MATCH]).join(",")})`;
const uuidLike = (v: string | null | undefined): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v);
/** Kanban columns, in the order work moves. */
const BOARD: TaskStatus[] = ["TODO", "ACCEPTED", "IN_PROGRESS", "WAITING_MATERIALS", "BLOCKED", "REVIEW", "COMPLETED"];

/** Tasks someone is still working on (active, unfinished assignments). */
async function workingTaskIds() {
  const rows = await all<{ taskId: string }>(() =>
    adminDb.from(tbl(schema.eventTaskAssignees)).select("taskId:task_id").is("removed_at", null).not("status", "in", "(COMPLETED,CANCELLED)").order("id"),
  );
  return [...new Set(rows.map((r) => r.taskId))];
}
/** Tasks waiting for a planner: the whole task, or someone's part, is in review. */
async function reviewTaskIds() {
  const [parts, whole] = await Promise.all([
    all<{ taskId: string }>(() => adminDb.from(tbl(schema.eventTaskAssignees)).select("taskId:task_id").is("removed_at", null).eq("status", "REVIEW").order("id")),
    all<{ id: string }>(() => adminDb.from(tbl(schema.eventTasks)).select("id").eq("status", "REVIEW").order("id")),
  ]);
  return [...new Set([...parts.map((r) => r.taskId), ...whole.map((r) => r.id)])];
}

export default async function TasksPage({ searchParams }: PageProps<"/admin/tasks">) {
  const user = await requirePage();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  if (!can("events.view")) redirect("/admin/my-work");
  const sp = await searchParams;
  const planner = can("events.update");
  const board = str0(sp.layout) === "board";
  const { page, pageSize, offset, q, str } = listParams(sp, board ? 300 : 40);
  const requested = str("view") ?? "";
  // People who only update tasks see their own
  const view: View = !planner ? "mine" : (VIEWS as readonly string[]).includes(requested) ? (requested as View) : "open";
  const status = str("status");
  const staffId = str("staff");
  const eventId = str("event");
  const priority = str("priority");
  const due = str("due");
  const now = new Date().toISOString();

  const [reviewIds, workingIds, staffTaskIds, myIds] = await Promise.all([
    planner ? reviewTaskIds() : Promise.resolve([] as string[]),
    view === "unassigned" ? workingTaskIds() : Promise.resolve([] as string[]),
    uuidLike(staffId) ? taskIdsForStaff(staffId) : Promise.resolve([] as string[]),
    view === "mine" && user.staffId ? taskIdsForStaff(user.staffId) : Promise.resolve([] as string[]),
  ]);

  let query = adminDb
    .from(tbl(schema.eventTasks))
    .select(
      `${cols(schema.eventTasks)},e:events(id,title,eventDate:event_date),w:work_orders!work_order_id(id,title),s:staff(name),u:profiles!assignee_user_id(fullName:full_name)`,
      { count: "exact" },
    );
  if (view === "mine") query = query.or(`assignee_user_id.eq.${user.id}${user.staffId ? `,assignee_staff_id.eq.${user.staffId},id.in.${idList(myIds)}` : ""}`);
  if (view === "unassigned") query = query.is("assignee_staff_id", null).is("assignee_user_id", null).not("id", "in", idList(workingIds));
  if (view === "review") query = query.in("id", reviewIds.length ? reviewIds : [NO_MATCH]);
  if (view === "overdue") query = query.lt("due_at", now).not("status", "in", "(COMPLETED,CANCELLED,REVIEW)");
  if (view === "done") query = query.eq("status", "COMPLETED");
  else if (status && (TASK_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  else if (view !== "review" && view !== "overdue") query = query.not("status", "in", "(COMPLETED,CANCELLED)");
  if (uuidLike(staffId)) query = query.or(`assignee_staff_id.eq.${staffId},id.in.${idList(staffTaskIds)}`);
  if (uuidLike(eventId)) query = query.eq("event_id", eventId);
  else if (eventId === "general") query = query.is("event_id", null);
  if (priority && ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(priority)) query = query.eq("priority", priority);
  if (due === "overdue") query = query.lt("due_at", now).not("status", "in", "(COMPLETED,CANCELLED,REVIEW)");
  if (due === "today") query = query.lt("due_at", new Date(`${todayISO(1)}T00:00:00+05:45`).toISOString());
  if (due === "week") query = query.lt("due_at", new Date(`${todayISO(7)}T00:00:00+05:45`).toISOString());
  if (due === "none") query = query.is("due_at", null);
  if (q) query = query.ilike("title", likeTerm(q));

  const [{ rows, total }, staff, users, events] = await Promise.all([
    paged<TaskRow>(query.order("due_at", { ascending: view !== "done", nullsFirst: false }).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1)),
    staffOptions(),
    userOptions(),
    planner
      ? many<{ value: string; label: string; date: string }>(
          adminDb.from(tbl(schema.events)).select("value:id,label:title,date:event_date").gte("event_date", todayISO(-30)).neq("status", "CANCELLED").order("event_date").limit(200),
        )
      : [],
  ]);
  const eventOptions = events.map((e) => ({ value: e.value, label: `${fmtDate(e.date)} — ${e.label}` }));
  const people = await assigneesFor(rows.map((r) => r.id));
  const reviewSet = new Set(reviewIds);

  const tasks = rows.map(({ e, w, s, u, ...t }) => {
    const parts = people.get(t.id) ?? [];
    const names = [...new Set([...parts.map((p) => p.s.name), s?.name, u?.fullName].filter((n): n is string => !!n))];
    const late = !!t.dueAt && t.dueAt.toISOString() < now && !["COMPLETED", "CANCELLED", "REVIEW"].includes(t.status);
    const inReview = reviewSet.has(t.id);
    const submitted = parts.filter((p) => p.status === "REVIEW").length;
    return { t, e, w, names, late, inReview, submitted, parts: parts.length };
  });
  type Item = (typeof tasks)[number];

  const base = "/admin/tasks";
  const layoutHref = (layout: "table" | "board") => hrefWith(base, sp, { layout: layout === "board" ? "board" : null, page: null });
  const viewHref = (v: View) => hrefWith(base, sp, { view: v === "open" ? null : v, status: null, page: null });
  const filtered = !!(q || status || staffId || eventId || priority || due);

  const where = (i: Item) => (
    <p className="text-xs text-a-muted">
      {i.e ? (
        <Link href={`/admin/events/${i.e.id}?tab=${i.w ? "work" : "tasks"}`} className="hover:underline">
          {i.e.title} · {fmtDate(i.e.eventDate)}
        </Link>
      ) : (
        "General"
      )}
      {i.w && <> · {i.w.title}</>}
    </p>
  );
  const dueText = (i: Item) =>
    i.t.dueAt ? <span className={i.late ? "font-medium text-a-danger" : undefined}>{i.late ? "Overdue · " : ""}{fmtDateTime(i.t.dueAt)}</span> : <span className="text-a-muted">No deadline</span>;
  const tags = (i: Item) => (
    <>
      {i.t.priority !== "MEDIUM" && <StatusBadge map={PRIORITY} value={i.t.priority} />}
      {i.t.reviewRequired && <Badge tone="accent" icon={false}>Needs approval</Badge>}
      {!i.t.countsTowardProgress && <Badge icon={false}>Optional</Badge>}
    </>
  );
  const actions = (i: Item) =>
    planner && (
      <span className="flex flex-wrap items-center gap-1.5">
        {i.inReview && <ReviewButtons taskId={i.t.id} title={i.t.title} />}
        <RequiredToggle id={i.t.id} required={i.t.countsTowardProgress} title={i.t.title} />
        <TaskButton eventId={i.t.eventId} staff={staff} users={users} values={i.t} />
        <DeleteTaskButton id={i.t.id} />
      </span>
    );

  return (
    <>
      <PageHeader
        title="Tasks"
        description={planner ? "Everything the team needs to do, across all events and work orders." : "Tasks assigned to you."}
        actions={planner && <TaskButton staff={staff} users={users} events={eventOptions} />}
      />
      {planner && (
        <Tabs
          active={view}
          items={[
            { key: "open", label: "Open", href: viewHref("open") },
            { key: "unassigned", label: "Unassigned", href: viewHref("unassigned") },
            { key: "review", label: "Review required", href: viewHref("review"), count: reviewIds.length },
            { key: "overdue", label: "Overdue", href: viewHref("overdue") },
            { key: "mine", label: "Mine", href: viewHref("mine") },
            { key: "done", label: "Completed", href: viewHref("done") },
          ]}
        />
      )}
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Search tasks" />
          {view !== "done" && view !== "review" && (
            <FilterSelect param="status" label="Status" options={options([...OPEN_TASK_STATUSES, "COMPLETED", "CANCELLED"], TASK_STATUS)} />
          )}
          {planner && <FilterSelect param="staff" label="Staff" allLabel="Anyone" options={staff} />}
          {planner && <FilterSelect param="event" label="Event" allLabel="Any" options={[{ value: "general", label: "General (no event)" }, ...eventOptions]} />}
          <FilterSelect param="priority" label="Priority" allLabel="Any" options={options(["URGENT", "HIGH", "MEDIUM", "LOW"], PRIORITY)} />
          {view !== "done" && (
            <FilterSelect
              param="due"
              label="Deadline"
              allLabel="Any time"
              options={[
                { value: "overdue", label: "Overdue" },
                { value: "today", label: "By today" },
                { value: "week", label: "Within 7 days" },
                { value: "none", label: "No deadline" },
              ]}
            />
          )}
          <span className="ml-auto inline-flex overflow-hidden rounded-md border border-a-border text-[13px]" role="group" aria-label="Layout">
            <Link href={layoutHref("table")} aria-current={!board ? "page" : undefined} className={`px-3 py-1.5 ${!board ? "bg-a-subtle font-medium" : "text-a-muted hover:text-a-text"}`}>
              Table
            </Link>
            <Link href={layoutHref("board")} aria-current={board ? "page" : undefined} className={`border-l border-a-border px-3 py-1.5 ${board ? "bg-a-subtle font-medium" : "text-a-muted hover:text-a-text"}`}>
              Board
            </Link>
          </span>
        </Toolbar>
        {tasks.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title={filtered ? "No tasks match" : view === "done" ? "Nothing completed yet" : view === "review" ? "Nothing waiting for review" : view === "unassigned" ? "Every open task has someone on it" : view === "overdue" ? "Nothing overdue" : "No open tasks"}
          >
            {view === "mine" ? "Nothing is assigned to you." : view === "review" ? "Tasks marked “needs approval” appear here when the team submits them." : "Tasks are added on each event’s work orders, or here for general work."}
          </EmptyState>
        ) : board ? (
          <div className="flex gap-3 overflow-x-auto p-3">
            {BOARD.filter((col) => col !== "COMPLETED" || view === "done" || status === "COMPLETED")
              .filter((col) => view !== "done" || col === "COMPLETED")
              .map((col) => {
                const list = tasks.filter((i) => i.t.status === col);
                return (
                  <section key={col} className="flex w-72 shrink-0 flex-col rounded-lg bg-a-subtle/60" aria-label={TASK_STATUS[col]?.label ?? col}>
                    <h2 className="flex items-center justify-between px-3 pt-2.5 pb-1.5 text-[13px] font-medium">
                      <StatusBadge map={TASK_STATUS} value={col} />
                      <span className="text-xs text-a-muted tabular-nums">{list.length}</span>
                    </h2>
                    <ul className="flex flex-col gap-2 p-2">
                      {list.map((i) => (
                        <li key={i.t.id} className="rounded-md border border-a-border bg-a-surface p-2.5 shadow-sm">
                          <p className="font-medium">{i.t.title}</p>
                          {where(i)}
                          <p className="mt-1 text-xs">{i.names.join(", ") || <span className="font-medium text-a-warning">Unassigned</span>}</p>
                          <p className="text-xs">{dueText(i)}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">{tags(i)}</div>
                          {i.inReview && i.t.status !== "REVIEW" && <p className="mt-1 text-xs text-a-muted">{i.submitted}/{i.parts} submitted for review</p>}
                          {planner && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-a-border pt-2">
                              <TaskStatusSelect id={i.t.id} status={i.t.status} />
                              {actions(i)}
                            </div>
                          )}
                        </li>
                      ))}
                      {list.length === 0 && <li className="px-1 py-3 text-center text-xs text-a-muted">Nothing here</li>}
                    </ul>
                  </section>
                );
              })}
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-8">
                  <span className="sr-only">Done</span>
                </Th>
                <Th>Task</Th>
                <Th>Assigned to</Th>
                <Th>Deadline</Th>
                <Th>Status</Th>
                {planner && <Th>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {tasks.map((i) => (
                <tr key={i.t.id} className="align-top hover:bg-a-subtle/60">
                  <Td>{!i.t.reviewRequired || i.t.status === "COMPLETED" || planner ? <TaskCheck id={i.t.id} done={i.t.status === "COMPLETED"} title={i.t.title} /> : null}</Td>
                  <Td>
                    <p className={i.t.status === "COMPLETED" ? "text-a-muted line-through" : "font-medium"}>{i.t.title}</p>
                    {where(i)}
                    <div className="mt-1 flex flex-wrap gap-1">{tags(i)}</div>
                  </Td>
                  <Td className="text-xs">
                    {i.names.length ? i.names.join(", ") : <span className="font-medium text-a-warning">Unassigned</span>}
                    {i.inReview && i.t.status !== "REVIEW" && <span className="block text-a-muted">{i.submitted}/{i.parts} submitted</span>}
                  </Td>
                  <Td className="text-xs whitespace-nowrap">{dueText(i)}</Td>
                  <Td>
                    <TaskStatusSelect id={i.t.id} status={i.t.status} />
                  </Td>
                  {planner && <Td>{actions(i)}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {(!board || total > pageSize) && <Pagination basePath={base} params={sp} page={page} pageSize={pageSize} total={total} />}
      </Card>
    </>
  );
}

function str0(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
