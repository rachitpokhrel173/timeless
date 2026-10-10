import type { Metadata } from "next";
import Link from "next/link";
import { ListTodo } from "lucide-react";
import { adminDb, cols, many, paged, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { staffOptions, userOptions } from "@/server/lookups";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { options, PRIORITY, StatusBadge, TASK_STATUS } from "@/components/admin/status";
import { Card, EmptyState, PageHeader, Pagination, Tabs, Toolbar } from "@/components/admin/ui";
import { DeleteTaskButton, TaskButton, TaskCheck, TaskStatusSelect } from "../events/EventClient";

export const metadata: Metadata = { title: "Tasks" };

type TaskRow = Row<typeof schema.eventTasks> & { e: { id: string; title: string; eventDate: string } | null; s: { name: string } | null; u: { fullName: string } | null };

export default async function TasksPage({ searchParams }: PageProps<"/admin/tasks">) {
  const user = await requirePage();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  if (!can("events.view") && !can("tasks.update")) await requirePage("events.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 40);
  const planner = can("events.update");
  // People who only update tasks see their own
  const view = !planner ? "mine" : str("view") === "mine" ? "mine" : str("view") === "done" ? "done" : "open";
  const status = str("status");
  const now = new Date().toISOString();

  let query = adminDb
    .from(tbl(schema.eventTasks))
    .select(`${cols(schema.eventTasks)},e:events(id,title,eventDate:event_date),s:staff(name),u:profiles!assignee_user_id(fullName:full_name)`, { count: "exact" });
  if (view === "mine") query = query.or(`assignee_user_id.eq.${user.id}${user.staffId ? `,assignee_staff_id.eq.${user.staffId}` : ""}`);
  if (view === "done") query = query.eq("status", "COMPLETED");
  else if (status && ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"].includes(status)) query = query.eq("status", status);
  else if (str("due") !== "overdue") query = query.neq("status", "COMPLETED");
  if (str("due") === "overdue") query = query.lt("due_at", now).neq("status", "COMPLETED");
  if (str("due") === "today") query = query.lt("due_at", new Date(`${todayISO(1)}T00:00:00+05:45`).toISOString());
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

  return (
    <>
      <PageHeader
        title="Tasks"
        description={planner ? "Everything the team needs to do, across all events." : "Tasks assigned to you."}
        actions={planner && <TaskButton staff={staff} users={users} events={eventOptions} />}
      />
      {planner && (
        <Tabs
          active={view}
          items={[
            { key: "open", label: "Open", href: "/admin/tasks" },
            { key: "mine", label: "Mine", href: "/admin/tasks?view=mine" },
            { key: "done", label: "Completed", href: "/admin/tasks?view=done" },
          ]}
        />
      )}
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Search tasks" />
          {view !== "done" && (
            <>
              <FilterSelect param="status" label="Status" options={options(["TODO", "IN_PROGRESS", "BLOCKED"], TASK_STATUS)} />
              <FilterSelect
                param="due"
                label="Due"
                allLabel="Any time"
                options={[
                  { value: "overdue", label: "Overdue" },
                  { value: "today", label: "By today" },
                ]}
              />
            </>
          )}
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={ListTodo} title={view === "done" ? "Nothing completed yet" : "No open tasks"}>
            {view === "mine" ? "Nothing is assigned to you." : "Tasks are added on each event, or here for general work."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-a-border">
            {rows.map(({ e, s, u, ...t }) => {
              const late = t.dueAt && t.dueAt.toISOString() < now && t.status !== "COMPLETED";
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <TaskCheck id={t.id} done={t.status === "COMPLETED"} title={t.title} />
                  <div className="min-w-0 flex-1">
                    <p className={t.status === "COMPLETED" ? "text-a-muted line-through" : "font-medium"}>{t.title}</p>
                    <p className="text-xs text-a-muted">
                      {e ? (
                        <Link href={`/admin/events/${e.id}?tab=tasks`} className="hover:underline">
                          {e.title} · {fmtDate(e.eventDate)}
                        </Link>
                      ) : (
                        "General"
                      )}
                      {" · "}
                      {[s?.name, u?.fullName].filter(Boolean).join(", ") || "Unassigned"}
                      {t.dueAt && <span className={late ? " font-medium text-a-danger" : undefined}> · due {fmtDateTime(t.dueAt)}</span>}
                    </p>
                  </div>
                  {t.priority !== "MEDIUM" && <StatusBadge map={PRIORITY} value={t.priority} />}
                  <TaskStatusSelect id={t.id} status={t.status} />
                  {planner && (
                    <span className="flex">
                      <TaskButton eventId={t.eventId} staff={staff} users={users} values={t} />
                      <DeleteTaskButton id={t.id} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Pagination basePath="/admin/tasks" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
