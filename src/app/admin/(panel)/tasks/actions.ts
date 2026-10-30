"use server";

import { z } from "zod";
import { afterCommit, cols, db, exec, many, maybe, one, schema, tbl, vals, type Row } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { onTaskProgress } from "@/server/automation";
import { notify } from "@/server/notifications";
import { fmtDateTime } from "@/lib/format";
import { applyWorkPlan, eventInfo, usersForStaff } from "@/server/work";

const tasks = () => db.from(tbl(schema.eventTasks));
const STATUS = z.enum(["TODO", "IN_PROGRESS", "COMPLETED", "BLOCKED"]);
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
  const t = await maybe<{ title: string; status: string; startedAt: Date | null; assigneeUserId: string | null; assigneeStaffId: string | null; eventId: string | null; proofMediaIds: string[] }>(
    tasks().select("title,status,startedAt:started_at,assigneeUserId:assignee_user_id,assigneeStaffId:assignee_staff_id,eventId:event_id,proofMediaIds:proof_media_ids").eq("id", id),
  );
  if (!t) throw new UserError("Task not found.");
  if (!user.permissions.has("events.update") && t.assigneeUserId !== user.id && (!user.staffId || t.assigneeStaffId !== user.staffId)) {
    throw new UserError("You can only update tasks assigned to you.");
  }
  return t;
}

/**
 * Staff with tasks.update can move their tasks along; planners can move any. Finishing can carry
 * a note for the planners, and blocking a reason.
 */
export const setTaskStatus = adminAction(
  ["events.update", "tasks.update"],
  z.object({ id: zs.uuid(), status: STATUS, note: zs.optional(2000), reason: zs.optional(500) }),
  async ({ id, status, note, reason }, user) => {
    const t = await ownTask(id, user);
    if (t.status === status && !note && !reason) return;
    const now = new Date();
    await exec(
      tasks()
        .update(
          vals(schema.eventTasks, {
            status,
            startedAt: status === "TODO" ? null : (t.startedAt ?? now),
            completedAt: status === "COMPLETED" ? now : null,
            completedBy: status === "COMPLETED" ? user.id : null,
            blockedReason: status === "BLOCKED" ? reason : null,
            ...(status === "COMPLETED" && note ? { completionNote: note } : {}),
          }),
        )
        .eq("id", id),
    );
    await audit(user, "status", "task", id, `“${t.title}” → ${status.toLowerCase().replace("_", " ")}${reason ? ` (${reason})` : ""}`);
    if (t.status !== status) {
      const actor = { id: user.id, name: user.name, planner: user.permissions.has("events.update") };
      afterCommit(() => onTaskProgress(id, status, actor));
    }
  },
);

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
