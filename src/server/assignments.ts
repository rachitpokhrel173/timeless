import "server-only";
import { adminDb, exec, many, maybe, schema, tbl, type DB } from "@/db";
import { UserError } from "@/lib/actions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { sendEmail } from "./email";
import { notify } from "./notifications";
import { usersForStaff } from "./work";

/*
 * Work management: who is on each task (event_task_assignees), their workload, telling them about
 * new work, and which bookings may be planned. Reads use the service-role client — every caller
 * checks the signed-in user's access first. Writes take the caller's client so RLS applies.
 */

export type Assignee = {
  id: string;
  taskId: string;
  staffId: string;
  status: string;
  acceptedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  completionNote: string | null;
  holdReason: string | null;
  proofMediaIds: string[];
  assignedAt: Date;
  removedAt: Date | null;
  s: { name: string; role: string | null; phone: string | null; photo: { url: string | null } | null };
};

const ASSIGNEE_COLS =
  "id,taskId:task_id,staffId:staff_id,status,acceptedAt:accepted_at,startedAt:started_at,completedAt:completed_at,completionNote:completion_note,holdReason:hold_reason,proofMediaIds:proof_media_ids,assignedAt:assigned_at,removedAt:removed_at,s:staff!inner(name,role,phone,photo:media(url))";

/** Assignments for these tasks, grouped by task (active only unless `includeRemoved`). */
export async function assigneesFor(taskIds: string[], opts: { includeRemoved?: boolean } = {}) {
  const out = new Map<string, Assignee[]>();
  const ids = [...new Set(taskIds)];
  for (let i = 0; i < ids.length; i += 150) {
    let q = adminDb.from(tbl(schema.eventTaskAssignees)).select(ASSIGNEE_COLS).in("task_id", ids.slice(i, i + 150));
    if (!opts.includeRemoved) q = q.is("removed_at", null);
    for (const a of await many<Assignee>(q.order("assigned_at"))) {
      const list = out.get(a.taskId) ?? [];
      list.push(a);
      out.set(a.taskId, list);
    }
  }
  return out;
}

/** Task ids a team member is on (active assignments; with `includeRemoved`, every one they ever had). */
export async function taskIdsForStaff(staffId: string, opts: { includeRemoved?: boolean } = {}) {
  let q = adminDb.from(tbl(schema.eventTaskAssignees)).select("taskId:task_id").eq("staff_id", staffId);
  if (!opts.includeRemoved) q = q.is("removed_at", null);
  return [...new Set((await many<{ taskId: string }>(q.limit(3000))).map((r) => r.taskId))];
}

/** The signed-in team member's own active assignment on a task, if any. */
export const myAssignment = (taskId: string, staffId: string | null) =>
  staffId
    ? maybe<{ id: string; status: string; proofMediaIds: string[] }>(
        adminDb.from(tbl(schema.eventTaskAssignees)).select("id,status,proofMediaIds:proof_media_ids").eq("task_id", taskId).eq("staff_id", staffId).is("removed_at", null),
      )
    : Promise.resolve(null);

/** Open work per team member (active, not completed) and how much of it is past its deadline. */
export async function workloads() {
  const rows = await many<{ staffId: string; t: { dueAt: string | null } }>(
    adminDb.from(tbl(schema.eventTaskAssignees)).select("staffId:staff_id,t:event_tasks!inner(dueAt:due_at)").is("removed_at", null).neq("status", "COMPLETED").limit(5000),
  );
  const now = Date.now();
  const out = new Map<string, { open: number; overdue: number }>();
  for (const r of rows) {
    const w = out.get(r.staffId) ?? { open: 0, overdue: 0 };
    w.open++;
    if (r.t.dueAt && new Date(r.t.dueAt).getTime() < now) w.overdue++;
    out.set(r.staffId, w);
  }
  return out;
}

/** Team members to choose from when assigning, with their load and availability on a day. */
export async function staffPicker(day?: string | null, eventId?: string | null) {
  const [people, load, away, team, logins] = await Promise.all([
    many<{ id: string; name: string; role: string | null; phone: string | null; photo: { url: string | null } | null }>(
      adminDb.from(tbl(schema.staff)).select("id,name,role,phone,photo:media(url)").eq("active", true).is("archived_at", null).order("name"),
    ),
    workloads(),
    day
      ? many<{ staffId: string; status: string; note: string | null }>(adminDb.from(tbl(schema.staffAvailability)).select("staffId:staff_id,status,note").eq("date", day).neq("status", "AVAILABLE"))
      : [],
    eventId ? many<{ staffId: string; role: string | null }>(adminDb.from(tbl(schema.staffAssignments)).select("staffId:staff_id,role").eq("event_id", eventId)) : [],
    many<{ staffId: string }>(adminDb.from(tbl(schema.profiles)).select("staffId:staff_id").not("staff_id", "is", null).eq("active", true)),
  ]);
  const withLogin = new Set(logins.map((l) => l.staffId));
  return people.map((p) => {
    const off = away.find((a) => a.staffId === p.id);
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      phone: p.phone,
      photo: p.photo?.url ?? null,
      open: load.get(p.id)?.open ?? 0,
      overdue: load.get(p.id)?.overdue ?? 0,
      away: off ? `${off.status === "LEAVE" ? "On leave" : "Unavailable"}${off.note ? ` — ${off.note}` : ""}` : null,
      onEvent: team.some((t) => t.staffId === p.id),
      hasLogin: withLogin.has(p.id),
    };
  });
}
export type PickerStaff = Awaited<ReturnType<typeof staffPicker>>[number];

/**
 * Make a task's active assignees exactly `staffIds`, writing as the caller (RLS applies). Removed
 * people keep their row as history. Returns who was added and removed.
 */
export async function syncAssignees(conn: DB, taskId: string, staffIds: string[], actorId: string) {
  const wanted = [...new Set(staffIds)];
  const current = await many<{ id: string; staffId: string }>(conn.from(tbl(schema.eventTaskAssignees)).select("id,staffId:staff_id").eq("task_id", taskId).is("removed_at", null));
  const drop = current.filter((a) => !wanted.includes(a.staffId));
  const add = wanted.filter((s) => !current.some((a) => a.staffId === s));
  if (add.length) {
    const ok = await many<{ id: string }>(adminDb.from(tbl(schema.staff)).select("id").in("id", add).eq("active", true).is("archived_at", null));
    if (ok.length !== add.length) throw new UserError("Choose active team members only.");
  }
  if (drop.length) {
    await exec(
      conn
        .from(tbl(schema.eventTaskAssignees))
        .update({ removed_at: new Date().toISOString(), removed_by: actorId })
        .in(
          "id",
          drop.map((a) => a.id),
        ),
    );
  }
  const added = add.length
    ? await many<{ id: string; staffId: string }>(
        conn
          .from(tbl(schema.eventTaskAssignees))
          .insert(add.map((staffId) => ({ task_id: taskId, staff_id: staffId, assigned_by: actorId })))
          .select("id,staffId:staff_id"),
      )
    : [];
  return { added, removed: drop };
}

/**
 * Tell newly assigned team members, in the app and by email. Keyed by the assignment id, so the
 * same assignment is never announced twice; people without a login get nothing (they can't open it).
 */
export async function notifyAssigned(taskId: string, added: { id: string; staffId: string }[], opts: { reassigned?: boolean } = {}) {
  if (!added.length) return;
  const task = await maybe<{
    title: string;
    dueAt: string | null;
    priority: string;
    e: { title: string; eventDate: string; venue: string | null; b: { number: string } | null } | null;
  }>(adminDb.from(tbl(schema.eventTasks)).select("title,dueAt:due_at,priority,e:events(title,eventDate:event_date,venue,b:bookings(number))").eq("id", taskId));
  if (!task) return;
  const users = await usersForStaff(added.map((a) => a.staffId));
  if (!users.size) return;
  const logins = await many<{ id: string; email: string; fullName: string }>(adminDb.from(tbl(schema.profiles)).select("id,email,fullName:full_name").in("id", [...users.values()]));
  const due = task.dueAt ? fmtDateTime(task.dueAt) : null;
  for (const a of added) {
    const userId = users.get(a.staffId);
    const login = logins.find((l) => l.id === userId);
    if (!userId || !login) continue;
    await notify({
      type: "task.assigned",
      title: `${opts.reassigned ? "Handed to you" : "New task"}: ${task.title}`,
      body: [task.e?.title, task.e && fmtDate(task.e.eventDate), due && `due ${due}`].filter(Boolean).join(" · ") || undefined,
      href: `/admin/my-work/${taskId}`,
      userId,
      priority: task.priority === "URGENT" ? "HIGH" : "MEDIUM",
      entityType: "task",
      entityId: taskId,
      dedupeKey: `task-assigned:${a.id}`,
    });
    await sendEmail(
      login.email,
      "taskAssigned",
      {
        staff: login.fullName || "there",
        task: task.title,
        event: task.e?.title ?? "an event",
        bookingCode: task.e?.b?.number,
        eventDate: task.e?.eventDate,
        venue: task.e?.venue,
        due,
        taskId,
        reassigned: opts.reassigned,
      },
      { entityType: "task", entityId: a.id },
    );
  }
}

/* ───────────────────────── Eligibility ───────────────────────── */

/**
 * Work is planned only after the client has approved: a confirmed (or running / finished) booking
 * whose quotation, when it came from one, was accepted — and which has an event.
 */
export function workEligibility(b: { status: string; quoteStatus: string | null; hasEvent: boolean }): { ok: true } | { ok: false; reason: string } {
  if (b.status === "CANCELLED") return { ok: false, reason: "This booking was cancelled." };
  if (b.quoteStatus && b.quoteStatus !== "ACCEPTED") return { ok: false, reason: "The client hasn't accepted the quotation yet." };
  if (b.status === "PENDING") return { ok: false, reason: "The booking is still pending — confirm it (record the advance) before assigning work." };
  if (!b.hasEvent) return { ok: false, reason: "This booking has no event yet." };
  return { ok: true };
}

/** Bookings that can carry work, with their event. */
export const WORK_BOOKING_STATUSES = ["CONFIRMED", "IN_PROGRESS", "COMPLETED"] as const;
