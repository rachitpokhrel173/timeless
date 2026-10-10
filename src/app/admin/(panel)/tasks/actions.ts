"use server";

import { z } from "zod";
import { cols, db, exec, many, maybe, one, schema, tbl, vals, type Row } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { notify } from "@/server/notifications";

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
    const values = vals(schema.eventTasks, { ...input, completedAt: input.status === "COMPLETED" ? new Date() : null });
    if (id) await exec(tasks().update(values).eq("id", id));
    else await exec(tasks().insert({ ...values, created_by: user.id }));
    if (!id && input.assigneeUserId && input.assigneeUserId !== user.id)
      await notify({ type: "task.assigned", title: `New task: ${input.title}`, href: input.eventId ? `/admin/events/${input.eventId}?tab=tasks` : "/admin/tasks", userId: input.assigneeUserId, priority: input.priority === "URGENT" ? "HIGH" : "MEDIUM" });
    await audit(user, id ? "update" : "create", "task", id ?? null, `${id ? "Updated" : "Added"} task “${input.title}”`);
  },
);

/** Staff with tasks.update can move their tasks along; planners can move any. */
export const setTaskStatus = adminAction(["events.update", "tasks.update"], z.object({ id: zs.uuid(), status: STATUS }), async ({ id, status }, user) => {
  const t = await maybe<{ title: string; assigneeUserId: string | null; assigneeStaffId: string | null }>(tasks().select("title,assigneeUserId:assignee_user_id,assigneeStaffId:assignee_staff_id").eq("id", id));
  if (!t) throw new UserError("Task not found.");
  if (!user.permissions.has("events.update") && t.assigneeUserId !== user.id && (!user.staffId || t.assigneeStaffId !== user.staffId)) {
    throw new UserError("You can only update tasks assigned to you.");
  }
  await exec(tasks().update({ status, completed_at: status === "COMPLETED" ? new Date().toISOString() : null }).eq("id", id));
  await audit(user, "status", "task", id, `“${t.title}” → ${status.toLowerCase().replace("_", " ")}`);
});

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
