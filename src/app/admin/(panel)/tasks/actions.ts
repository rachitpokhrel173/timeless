"use server";

import { z } from "zod";
import { afterCommit, cols, db, exec, many, maybe, one, schema, tbl, vals, type Row } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { onTaskProgress } from "@/server/automation";
import { notify } from "@/server/notifications";
import { fmtDateTime } from "@/lib/format";
import { myAssignment } from "@/server/assignments";
import { applyWorkPlan, eventInfo, usersForStaff } from "@/server/work";
import { isHeld, TASK_LABELS, TASK_STATUSES } from "@/lib/task-status";

const tasks = () => db.from(tbl(schema.eventTasks));
const STATUS = z.enum(TASK_STATUSES);
const PRIORITY = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

const dueAt = () =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date.")
    // datetime-local has no zone: interpret it as Nepal time
    .transform((v) => (v ? new Date(v.length <= 16 ? `${v.length === 10 ? `${v}T17:00` : v}:00+05:45` : v) : null));

export const saveTask = adminAction(
  "events.update",
  z.object({
    id: zs.optUuid(),
    eventId: zs.optUuid(),
    title: zs.required("Title", 200),
    description: zs.optional(2000),
    assigneeStaffId: zs.optUuid(),
    assigneeUserId: zs.optUuid(),
    teamRole: zs.optional(60),
    dueAt: dueAt(),
    priority: PRIORITY.default("MEDIUM"),
    status: STATUS.default("TODO"),
    checklist: z
      .enum(["PRE", "POST", ""])
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
  }),
  async ({ id, ...input }, user) => {
    const before = id ? await maybe<{ assigneeStaffId: string | null; status: string }>(tasks().select("assigneeStaffId:assignee_staff_id,status").eq("id", id)) : null;
    const values = vals(schema.eventTasks, {
      ...input,
      ...(input.status === before?.status ? {} : { completedAt: input.status === "COMPLETED" ? new Date() : null, completedBy: input.status === "COMPLETED" ? user.id : null }),
    });
    if (id) await exec(tasks().update(values).eq("id", id));
    else await exec(tasks().insert({ ...values, created_by: user.id }));
    if (!id && input.assigneeUserId && input.assigneeUserId !== user.id)
      await notify({ type: "task.assigned", title: `New task: ${input.title}`, href: "/admin/my-work", userId: input.assigneeUserId, priority: input.priority === "URGENT" ? "HIGH" : "MEDIUM" });
    // A team member's login hears about work handed to their staff record
    if (input.assigneeStaffId && input.assigneeStaffId !== before?.assigneeStaffId && input.assigneeStaffId !== user.staffId) {
      const staffId = input.assigneeStaffId;
      const event = input.eventId ? await eventInfo(input.eventId) : null;
      afterCommit(async () => {
        const userId = (await usersForStaff([staffId])).get(staffId);
        if (userId)
          await notify({
            type: "task.assigned",
            title: `New task: ${input.title}`,
            body: [event?.title, input.dueAt && `due ${fmtDateTime(input.dueAt)}`].filter(Boolean).join(" · ") || undefined,
            href: "/admin/my-work",
            userId,
            priority: input.priority === "URGENT" ? "HIGH" : "MEDIUM",
          });
      });
    }
    await audit(user, id ? "update" : "create", "task", id ?? null, `${id ? "Updated" : "Added"} task “${input.title}”`);
  },
);

async function ownTask(id: string, user: SessionUser) {
  const t = await maybe<{ title: string; status: string; startedAt: Date | null; assigneeUserId: string | null; eventId: string | null }>(
    tasks().select("title,status,startedAt:started_at,assigneeUserId:assignee_user_id,eventId:event_id").eq("id", id),
  );
  if (!t) throw new UserError("Task not found.");
  const mine = await myAssignment(id, user.staffId);
  if (!user.permissions.has("events.update") && !mine && t.assigneeUserId !== user.id) throw new UserError("You can only update tasks assigned to you.");
  return { ...t, mine };
}

/**
 * Move work along. A team member on the task updates their own assignment (the task's status is
 * rolled up from everyone's by the database); planners set the whole task. Finishing can carry a
 * note for the planners; putting work on hold needs a reason.
 */
export const setTaskStatus = adminAction(
  ["events.update", "tasks.update"],
  z.object({ id: zs.uuid(), status: STATUS, note: zs.optional(2000), reason: zs.optional(500), asPlanner: z.boolean().default(false) }),
  async ({ id, status, note, reason, asPlanner: planned }, user) => {
    let asPlanner = planned;
    if (status === "BLOCKED" && !reason) throw new UserError("Say why the work is on hold.", { reason: "Required." });
    const t = await ownTask(id, user);
    const planner = user.permissions.has("events.update");
    if (status === "CANCELLED" && !planner) throw new UserError("Only a planner can cancel a task.");
    // Cancelling is for the whole task, never one person's part
    if (status === "CANCELLED") asPlanner = true;

    if (t.mine && !(planner && asPlanner)) {
      if (t.mine.status === status && !note && !reason) return;
      await exec(
        db
          .from(tbl(schema.eventTaskAssignees))
          .update({
            status,
            hold_reason: isHeld(status) ? reason || null : null,
            // A part submitted for review keeps its note too (Phase 3 manager review)
            ...((status === "COMPLETED" || status === "REVIEW") && note ? { completion_note: note } : {}),
          })
          .eq("id", t.mine.id),
      );
    } else {
      if (t.status === status && !note && !reason) return;
      const now = new Date();
      await exec(
        tasks()
          .update(
            vals(schema.eventTasks, {
              status,
              startedAt: status === "TODO" || status === "ACCEPTED" || (status === "CANCELLED" && !t.startedAt) ? null : (t.startedAt ?? now),
              completedAt: status === "COMPLETED" ? now : null,
              completedBy: status === "COMPLETED" ? user.id : null,
              blockedReason: isHeld(status) ? reason || null : null,
              ...((status === "COMPLETED" || status === "REVIEW") && note ? { completionNote: note } : {}),
            }),
          )
          .eq("id", id),
      );
    }
    const after = await maybe<{ status: string }>(tasks().select("status").eq("id", id));
    await audit(user, "status", "task", id, `“${t.title}” → ${(TASK_LABEL[status] ?? status).toLowerCase()}${t.mine && !asPlanner ? " (own part)" : ""}${reason ? ` (${reason})` : ""}`);
    const actor = { id: user.id, name: user.name, planner };
    // Planners hear at once when someone puts work on hold; the rest follows the task's rolled-up status
    if (isHeld(status)) afterCommit(() => onTaskProgress(id, status, actor));
    else if (after && after.status !== t.status) afterCommit(() => onTaskProgress(id, after.status, actor));
    else if (status === "COMPLETED" && t.mine && !planner)
      afterCommit(() =>
        notify({
          type: "task.progress",
          title: `${user.name} finished their part of “${t.title}”`,
          body: note ?? undefined,
          href: `/admin/my-work/${id}`,
          permission: "events.update",
          entityType: "task",
          entityId: id,
        }),
      );
  },
);

const TASK_LABEL: Record<string, string> = TASK_LABELS;

export const deleteTask = adminAction("events.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const t = await one<{ title: string }>(tasks().delete().eq("id", id).select("title"));
  await audit(user, "delete", "task", id, `Deleted task “${t.title}”`);
});

/** Add a reusable checklist (Settings → checklists) to an event as tasks. */
export const addChecklist = adminAction("events.update", z.object({ eventId: zs.uuid(), templateId: zs.uuid() }), async ({ eventId, templateId }, user) => {
  const tpl = await maybe<Row<typeof schema.checklistTemplates>>(db.from(tbl(schema.checklistTemplates)).select(cols(schema.checklistTemplates)).eq("id", templateId));
  if (!tpl) throw new UserError("Checklist not found.");
  const existing = new Set((await many<{ title: string }>(tasks().select("title").eq("event_id", eventId))).map((t) => t.title));
  const rows = tpl.items.filter((title) => !existing.has(title)).map((title, position) => vals(schema.eventTasks, { eventId, title, checklist: tpl.phase, position, createdBy: user.id }));
  if (!rows.length) throw new UserError("Those checklist items are already on this event.");
  await exec(tasks().insert(rows));
  await audit(user, "create", "task", null, `Added the “${tpl.name}” checklist (${rows.length} items)`, { eventId });
  return { added: rows.length };
});

/** Add a work plan (Settings → Work plans) to an event as dated, role-assigned tasks. */
export const addWorkPlan = adminAction("events.update", z.object({ eventId: zs.uuid(), planId: z.string().trim().min(1).max(60) }), async ({ eventId, planId }, user) => {
  const result = await applyWorkPlan(eventId, { planId, actorId: user.id });
  if (!result) throw new UserError("Work plan not found.");
  if (!result.added) throw new UserError("Every step of that plan is already on this event.");
  await audit(user, "create", "task", null, `Added the “${result.plan}” work plan (${result.added} tasks, ${result.assigned} assigned)`, { eventId });
  return result;
});
