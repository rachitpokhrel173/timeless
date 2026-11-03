"use server";

import { z } from "zod";
import { db, exec, many, maybe, schema, tbl } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { notify } from "@/server/notifications";
import { usersForStaff } from "@/server/work";

/*
 * Manager review (Phase 3). On a task marked "review required" the team submits their part for
 * review (status REVIEW) instead of completing it — the database refuses a team member's
 * COMPLETED. A planner (events.update) then approves it or sends it back with what to change.
 * Writes run as the planner, so RLS and the task triggers (roll-up, history) apply.
 */

async function reviewTask(taskId: string) {
  const t = await maybe<{ id: string; title: string; status: string; e: { title: string } | null }>(db.from(tbl(schema.eventTasks)).select("id,title,status,e:events(title)").eq("id", taskId));
  if (!t) throw new UserError("Task not found.");
  const parts = await many<{ id: string; staffId: string; status: string }>(
    db.from(tbl(schema.eventTaskAssignees)).select("id,staffId:staff_id,status").eq("task_id", taskId).is("removed_at", null),
  );
  const waiting = parts.filter((p) => p.status === "REVIEW");
  if (t.status !== "REVIEW" && !waiting.length) throw new UserError("Nothing on this task is waiting for review.");
  return { t, parts, waiting };
}

async function tellTeam(staffIds: string[], n: { title: string; body?: string; taskId: string; key: string }) {
  const users = await usersForStaff(staffIds);
  for (const [staffId, userId] of users)
    await notify({ type: "task.review", title: n.title, body: n.body, userId, href: `/admin/my-work/${n.taskId}`, entityType: "task", entityId: n.taskId, dedupeKey: `${n.key}:${staffId}` });
}

export const approveTask = adminAction("events.update", z.object({ taskId: zs.uuid(), note: zs.optional(1000) }), async ({ taskId, note }, user) => {
  const { t, parts, waiting } = await reviewTask(taskId);
  const stillWorking = parts.filter((p) => !["REVIEW", "COMPLETED", "CANCELLED"].includes(p.status));
  if (stillWorking.length) throw new UserError(`${stillWorking.length} person(s) on this task haven't submitted their part yet.`);
  const now = new Date().toISOString();
  // The task's status flows to every assignee (event_tasks_sync), completing their parts
  await exec(db.from(tbl(schema.eventTasks)).update({ status: "COMPLETED", reviewed_at: now, reviewed_by: user.id, completed_by: user.id }).eq("id", taskId));
  if (note) await exec(db.from(tbl(schema.eventTaskComments)).insert({ task_id: taskId, body: `Approved: ${note}`, author_id: user.id }));
  await audit(user, "approve", "task", taskId, `Approved “${t.title}”${note ? ` — ${note}` : ""}`);
  await tellTeam(
    waiting.map((w) => w.staffId),
    { title: `Approved: ${t.title}`, body: note ?? t.e?.title, taskId, key: `task-approved:${taskId}:${now}` },
  );
});

export const requestRevisions = adminAction(
  "events.update",
  z.object({ taskId: zs.uuid(), note: zs.required("What needs changing", 1000) }),
  async ({ taskId, note }, user) => {
    const { t, waiting } = await reviewTask(taskId);
    if (!waiting.length) throw new UserError("Nobody's part is waiting for review.");
    await exec(
      db
        .from(tbl(schema.eventTaskAssignees))
        .update({ status: "IN_PROGRESS" })
        .in(
          "id",
          waiting.map((w) => w.id),
        ),
    );
    await exec(db.from(tbl(schema.eventTasks)).update({ reviewed_at: null, reviewed_by: null }).eq("id", taskId));
    await exec(db.from(tbl(schema.eventTaskComments)).insert({ task_id: taskId, body: `Changes requested: ${note}`, author_id: user.id }));
    await audit(user, "revise", "task", taskId, `Requested changes on “${t.title}”: ${note}`);
    await tellTeam(
      waiting.map((w) => w.staffId),
      { title: `Changes requested: ${t.title}`, body: note, taskId, key: `task-revise:${taskId}:${Date.now()}` },
    );
  },
);
