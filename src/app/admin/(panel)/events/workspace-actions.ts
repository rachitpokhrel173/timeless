"use server";

import { z } from "zod";
import { afterCommit, db, exec, many, maybe, one, rpc, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { advanceLead } from "@/server/crm";
import { notify } from "@/server/notifications";
import { usersForStaff } from "@/server/work";

/*
 * Event workspace: work orders, confirmed services, task checklists and comments, completion.
 * Multi-step workflows run as single database transactions (functions in migration 00020);
 * these actions add the audit trail and notifications around them.
 */

const WORK_ORDER_STATUS = z.enum(["OPEN", "IN_PROGRESS", "ON_HOLD", "DONE", "CANCELLED"]);
const SERVICE_STATUS = z.enum(["PLANNED", "IN_PROGRESS", "READY", "DONE", "CANCELLED"]);
const PRIORITY = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const wo = () => db.from(tbl(schema.workOrders));

const dateOnly = () =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date.");
const dueAt = () =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date.")
    // datetime-local has no zone: interpret it as Nepal time
    .transform((v) => (v ? new Date(v.length <= 16 ? `${v.length === 10 ? `${v}T17:00` : v}:00+05:45` : v) : null));

async function openEvent(eventId: string) {
  const ev = await maybe<{ id: string; title: string; status: string }>(db.from(tbl(schema.events)).select("id,title,status").eq("id", eventId));
  if (!ev) throw new UserError("Event not found.");
  if (ev.status === "COMPLETED" || ev.status === "CANCELLED") throw new UserError(`This event is ${ev.status.toLowerCase()} — reopen it to change the plan.`);
  return ev;
}

/* ───────── Work orders ───────── */

/** One work order per confirmed service that doesn't have one yet (safe to press twice). */
export const createWorkOrdersFromServices = adminAction("events.update", z.object({ eventId: zs.uuid() }), async ({ eventId }, user) => {
  const ev = await openEvent(eventId);
  const created = await rpc<number>(db, "create_work_orders_from_services", { p_event: eventId });
  if (!created) throw new UserError("Every confirmed service already has a work order.");
  await audit(user, "create", "work_order", null, `Created ${created} work order${created === 1 ? "" : "s"} from the services of ${ev.title}`, { eventId });
  return { created };
});

export const saveWorkOrder = adminAction(
  "events.update",
  z.object({
    id: zs.optUuid(),
    eventId: zs.uuid(),
    bookingItemId: zs.optUuid(),
    designId: zs.optUuid(),
    title: zs.required("Title", 200),
    description: zs.optional(4000),
    instructions: zs.optional(4000),
    requiredMaterials: zs.optional(4000),
    teamRole: zs.optional(60),
    assignedStaffId: zs.optUuid(),
    startDate: dateOnly(),
    dueAt: dueAt(),
    priority: PRIORITY.default("MEDIUM"),
  }),
  async ({ id, eventId, ...input }, user) => {
    const ev = await openEvent(eventId);
    const before = id ? await maybe<{ assignedStaffId: string | null; eventId: string }>(wo().select("assignedStaffId:assigned_staff_id,eventId:event_id").eq("id", id)) : null;
    if (id && (!before || before.eventId !== eventId)) throw new UserError("Work order not found.");
    const values = vals(schema.workOrders, input);
    const saved = id
      ? await one<{ id: string }>(wo().update(values).eq("id", id).select("id"))
      : await one<{ id: string }>(wo().insert({ ...values, event_id: eventId, created_by: user.id }).select("id"));
    // The lead of the work order hears about it
    const staffId = input.assignedStaffId;
    if (staffId && staffId !== before?.assignedStaffId && staffId !== user.staffId)
      afterCommit(async () => {
        const userId = (await usersForStaff([staffId])).get(staffId);
        if (userId) await notify({ type: "task.assigned", title: `Work order: ${input.title}`, body: ev.title, href: `/admin/my-work`, userId, priority: input.priority === "URGENT" ? "HIGH" : "MEDIUM" });
      });
    await audit(user, id ? "update" : "create", "work_order", saved.id, `${id ? "Updated" : "Added"} work order “${input.title}”`, { eventId });
    return { id: saved.id };
  },
);

/** Status changes are recorded in the work order's history by the database. */
export const setWorkOrderStatus = adminAction(
  ["events.update", "tasks.update"],
  z.object({ id: zs.uuid(), status: WORK_ORDER_STATUS, note: zs.optional(2000) }),
  async ({ id, status, note }, user) => {
    const w = await maybe<{ title: string; status: string; eventId: string }>(wo().select("title,status,eventId:event_id").eq("id", id));
    if (!w) throw new UserError("Work order not found.");
    if (status === "ON_HOLD" && !note) throw new UserError("Say why the work order is on hold.", { note: "Required." });
    if (status === "CANCELLED" && !user.permissions.has("events.update")) throw new UserError("Only a planner can cancel a work order.");
    if (w.status !== status) {
      // RLS lets planners update; a member of the work order's team sees "permission" otherwise
      const row = await maybe<{ id: string }>(wo().update({ status }).eq("id", id).select("id"));
      if (!row) throw new UserError("You can't change this work order.");
    }
    if (note) await exec(db.from(tbl(schema.workOrderUpdates)).insert(vals(schema.workOrderUpdates, { workOrderId: id, body: note, actorId: user.id })));
    await audit(user, "status", "work_order", id, `“${w.title}” → ${status.toLowerCase().replace("_", " ")}${note ? ` (${note})` : ""}`, { eventId: w.eventId });
    if (status === "ON_HOLD")
      await notify({ type: "task.blocked", title: `Work order on hold: ${w.title}`, body: note ?? undefined, href: `/admin/events/${w.eventId}?tab=work-orders`, priority: "HIGH", permission: "events.update" });
  },
);

export const addWorkOrderNote = adminAction(["events.update", "tasks.update"], z.object({ workOrderId: zs.uuid(), body: zs.required("Note", 2000) }), async ({ workOrderId, body }, user) => {
  await exec(db.from(tbl(schema.workOrderUpdates)).insert(vals(schema.workOrderUpdates, { workOrderId, body, actorId: user.id })));
});

export const deleteWorkOrder = adminAction("events.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const tasks = await many<{ id: string }>(db.from(tbl(schema.eventTasks)).select("id").eq("work_order_id", id).limit(1));
  if (tasks.length) throw new UserError("This work order has tasks — cancel it instead, or move its tasks first.");
  const w = await one<{ title: string; eventId: string }>(wo().delete().eq("id", id).select("title,eventId:event_id"));
  await audit(user, "delete", "work_order", id, `Deleted work order “${w.title}”`, { eventId: w.eventId });
});

/** Turn a work order into a task on the event's task list (linked back to it). */
export const addTaskForWorkOrder = adminAction(
  "events.update",
  z.object({ workOrderId: zs.uuid(), title: zs.required("Title", 200), assigneeStaffId: zs.optUuid(), dueAt: dueAt(), priority: PRIORITY.default("MEDIUM") }),
  async ({ workOrderId, ...input }, user) => {
    const w = await maybe<{ eventId: string; title: string; teamRole: string | null; instructions: string | null }>(
      wo().select("eventId:event_id,title,teamRole:team_role,instructions").eq("id", workOrderId),
    );
    if (!w) throw new UserError("Work order not found.");
    await openEvent(w.eventId);
    const t = await one<{ id: string }>(
      db
        .from(tbl(schema.eventTasks))
        .insert({ ...vals(schema.eventTasks, { ...input, eventId: w.eventId, workOrderId, teamRole: w.teamRole, description: w.instructions }), created_by: user.id })
        .select("id"),
    );
    if (input.assigneeStaffId && input.assigneeStaffId !== user.staffId) {
      const staffId = input.assigneeStaffId;
      afterCommit(async () => {
        const userId = (await usersForStaff([staffId])).get(staffId);
        if (userId) await notify({ type: "task.assigned", title: `New task: ${input.title}`, body: w.title, href: `/admin/my-work/${t.id}`, userId });
      });
    }
    await audit(user, "create", "task", t.id, `Added task “${input.title}” to work order “${w.title}”`, { eventId: w.eventId });
  },
);

/* ───────── Confirmed services (booking items) ───────── */

export const saveService = adminAction(
  ["events.update", "bookings.update"],
  z.object({ id: zs.uuid(), status: SERVICE_STATUS, specifications: zs.optional(4000) }),
  async ({ id, status, specifications }, user) => {
    // Prices and quantities stay as booked (they're the contract); only delivery details change here
    const row = await maybe<{ description: string }>(db.from(tbl(schema.bookingItems)).update({ status, specifications }).eq("id", id).select("description"));
    if (!row) throw new UserError("You can't change this service (it needs the bookings permission).");
    await audit(user, "update", "booking_item", id, `Service “${row.description}” → ${status.toLowerCase().replace("_", " ")}`);
  },
);

/* ───────── Task checklist & comments ───────── */

const checklist = () => db.from(tbl(schema.eventTaskChecklistItems));

export const addChecklistItem = adminAction("events.update", z.object({ taskId: zs.uuid(), label: zs.required("Item", 300) }), async ({ taskId, label }, user) => {
  const last = await maybe<{ position: number }>(checklist().select("position").eq("task_id", taskId).order("position", { ascending: false }).limit(1));
  await exec(checklist().insert(vals(schema.eventTaskChecklistItems, { taskId, label, position: (last?.position ?? -1) + 1, createdBy: user.id })));
});

/** Tick or untick. Anyone working on the task can; the database records who ticked it. */
export const toggleChecklistItem = adminAction(["events.update", "tasks.update"], z.object({ id: zs.uuid(), done: z.boolean() }), async ({ id, done }, user) => {
  const row = await maybe<{ id: string }>(
    checklist()
      .update({ done_at: done ? new Date().toISOString() : null, done_by: done ? user.id : null })
      .eq("id", id)
      .select("id"),
  );
  if (!row) throw new UserError("You can only tick items on tasks you're working on.");
});

export const deleteChecklistItem = adminAction("events.update", z.object({ id: zs.uuid() }), async ({ id }) => {
  await exec(checklist().delete().eq("id", id));
});

const comments = () => db.from(tbl(schema.eventTaskComments));

export const addTaskComment = adminAction(["events.update", "tasks.update"], z.object({ taskId: zs.uuid(), body: zs.required("Comment", 2000) }), async ({ taskId, body }, user) => {
  const task = await maybe<{ title: string; createdBy: string | null }>(db.from(tbl(schema.eventTasks)).select("title,createdBy:created_by").eq("id", taskId));
  if (!task) throw new UserError("Task not found.");
  await exec(comments().insert(vals(schema.eventTaskComments, { taskId, body, authorId: user.id })));
  // Planners follow the conversation; the comment author isn't told about their own comment
  if (!user.permissions.has("events.update"))
    await notify({ type: "task.progress", title: `${user.name} commented on “${task.title}”`, body: body.slice(0, 200), href: `/admin/my-work/${taskId}`, permission: "events.update", entityType: "task", entityId: taskId });
});

/** Comments are kept for the record: removing one hides it. */
export const deleteTaskComment = adminAction(["events.update", "tasks.update"], z.object({ id: zs.uuid() }), async ({ id }) => {
  const row = await maybe<{ id: string }>(comments().update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id"));
  if (!row) throw new UserError("You can only remove your own comments.");
});

/* ───────── Completion ───────── */

/**
 * Close the event: every work order, task and inventory line must be finished first (checked in
 * the database, in one transaction). Payments are untouched — any balance stays on the booking.
 */
export const completeEvent = adminAction("events.complete", z.object({ eventId: zs.uuid(), notes: zs.optional(4000) }), async ({ eventId, notes }, user) => {
  const r = await rpc<{ eventId: string; bookingId: string | null; bookingNumber: string | null; leadId: string | null; balance: number }>(db, "complete_event", {
    p_event: eventId,
    p_notes: notes,
  });
  await advanceLead(db, r.leadId, "COMPLETED", user, `Event completed${r.bookingNumber ? ` (${r.bookingNumber})` : ""}`);
  await audit(user, "complete", "event", eventId, `Completed the event${r.bookingNumber ? ` (${r.bookingNumber})` : ""}${r.balance > 0 ? ` with a balance still due` : ""}`);
  if (r.balance > 0 && r.bookingId)
    await notify({
      type: "payment.due",
      title: `Event completed — balance still due on ${r.bookingNumber}`,
      href: `/admin/bookings/${r.bookingId}?tab=payments`,
      priority: "HIGH",
      permission: "payments.view",
      dedupeKey: `completed-balance:${r.bookingId}`,
    });
  return { balance: r.balance };
});
