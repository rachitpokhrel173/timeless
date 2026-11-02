"use server";

import { z } from "zod";
import { adminDb, afterCommit, db, exec, many, maybe, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { notifyAssigned, syncAssignees, workEligibility } from "@/server/assignments";

/*
 * Work management on an approved booking: the planner breaks the decoration work into tasks and
 * hands them to the team. Nothing here touches the quotation or the booking's money — tasks hang
 * off the booking's event. Writes run as the signed-in planner, so RLS applies (events.update).
 */

const PRIORITY = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const tasks = () => db.from(tbl(schema.eventTasks));

const dueAt = () =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date and time.")
    // datetime-local has no zone: Nepal time
    .transform((v) => (v ? new Date(v.length <= 16 ? `${v.length === 10 ? `${v}T17:00` : v}:00+05:45` : v) : null));

const staffIds = () =>
  z
    .union([z.array(z.string()), z.string()])
    .optional()
    .nullable()
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v]).filter(Boolean))
    .refine((v) => v.every((x) => /^[0-9a-f-]{36}$/i.test(x)), "Invalid team member.")
    .refine((v) => v.length <= 20, "Assign up to 20 people.");

/** The booking behind a task or booking id, and whether work may be planned on it. */
async function workBooking(bookingId: string) {
  const b = await maybe<{ id: string; number: string; status: string; q: { status: string } | null; e: { id: string; eventDate: string } | { id: string; eventDate: string }[] | null }>(
    adminDb.from(tbl(schema.bookings)).select("id,number,status,q:quotations(status),e:events(id,eventDate:event_date)").eq("id", bookingId),
  );
  if (!b) throw new UserError("Booking not found.");
  const event = Array.isArray(b.e) ? (b.e[0] ?? null) : b.e;
  const check = workEligibility({ status: b.status, quoteStatus: b.q?.status ?? null, hasEvent: !!event });
  if (!check.ok) throw new UserError(check.reason);
  return { ...b, event: event! };
}

async function taskBooking(taskId: string) {
  const t = await maybe<{ id: string; title: string; eventId: string | null; e: { bookingId: string | null } | null }>(
    adminDb.from(tbl(schema.eventTasks)).select("id,title,eventId:event_id,e:events(bookingId:booking_id)").eq("id", taskId),
  );
  if (!t) throw new UserError("Task not found.");
  return t;
}

/** Assign, then tell the new people once the whole action has succeeded. */
async function assign(taskId: string, ids: string[], user: SessionUser) {
  const { added, removed } = await syncAssignees(db, taskId, ids, user.id);
  if (added.length) afterCommit(() => notifyAssigned(taskId, added, { reassigned: removed.length > 0 }));
  return { added: added.length, removed: removed.length };
}

async function saveInternal(taskId: string, notes: string | null, user: SessionUser) {
  await exec(db.from(tbl(schema.eventTaskInternal)).upsert({ task_id: taskId, notes: notes ?? "", updated_by: user.id }, { onConflict: "task_id" }));
}

export const saveWorkTask = adminAction(
  "events.update",
  z
    .object({
      id: zs.optUuid(),
      bookingId: zs.optUuid(),
      title: zs.required("Title", 200),
      description: zs.optional(4000),
      staffInstructions: zs.optional(2000),
      internalNotes: zs.optional(2000),
      startDate: zs.date(),
      dueAt: dueAt(),
      priority: PRIORITY.default("MEDIUM"),
      staffIds: staffIds(),
    })
    .refine((v) => !v.startDate || !v.dueAt || new Date(`${v.startDate}T00:00:00+05:45`) <= v.dueAt, { message: "The deadline is before the start date.", path: ["dueAt"] }),
  async ({ id, bookingId, internalNotes, staffIds: ids, ...input }, user) => {
    let taskId = id;
    if (id) {
      const t = await taskBooking(id);
      if (t.e?.bookingId) await workBooking(t.e.bookingId);
      await exec(tasks().update(vals(schema.eventTasks, input)).eq("id", id));
    } else {
      if (!bookingId) throw new UserError("Choose a booking.");
      const b = await workBooking(bookingId);
      const last = await maybe<{ position: number }>(tasks().select("position").eq("event_id", b.event.id).order("position", { ascending: false }).limit(1));
      const row = await one<{ id: string }>(
        tasks()
          .insert(vals(schema.eventTasks, { ...input, eventId: b.event.id, position: (last?.position ?? -1) + 1, createdBy: user.id }))
          .select("id"),
      );
      taskId = row.id;
    }
    const changes = await assign(taskId!, ids, user);
    if (internalNotes !== undefined) await saveInternal(taskId!, internalNotes, user);
    await audit(user, id ? "update" : "create", "task", taskId!, `${id ? "Updated" : "Added"} task “${input.title}”${changes.added ? ` · ${changes.added} assigned` : ""}${changes.removed ? ` · ${changes.removed} removed` : ""}`);
    return { id: taskId! };
  },
);

/** Quick (re)assignment from the board. */
export const setTaskAssignees = adminAction("events.update", z.object({ taskId: zs.uuid(), staffIds: staffIds() }), async ({ taskId, staffIds: ids }, user) => {
  const t = await taskBooking(taskId);
  if (t.e?.bookingId) await workBooking(t.e.bookingId);
  const changes = await assign(taskId, ids, user);
  if (!changes.added && !changes.removed) return changes;
  await audit(user, "assign", "task", taskId, `Assignments on “${t.title}”: ${changes.added} added, ${changes.removed} removed`);
  return changes;
});

export const duplicateWorkTask = adminAction("events.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const src = await maybe<{
    eventId: string | null;
    title: string;
    description: string | null;
    staffInstructions: string | null;
    startDate: string | null;
    dueAt: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    teamRole: string | null;
    workDay: number | null;
    referenceMediaIds: string[];
    position: number;
  }>(
    tasks()
      .select("eventId:event_id,title,description,staffInstructions:staff_instructions,startDate:start_date,dueAt:due_at,priority,teamRole:team_role,workDay:work_day,referenceMediaIds:reference_media_ids,position")
      .eq("id", id),
  );
  if (!src) throw new UserError("Task not found.");
  const row = await one<{ id: string }>(
    tasks()
      .insert(
        vals(schema.eventTasks, {
          eventId: src.eventId,
          title: `${src.title} (copy)`.slice(0, 200),
          description: src.description,
          staffInstructions: src.staffInstructions,
          startDate: src.startDate,
          dueAt: src.dueAt ? new Date(src.dueAt) : null,
          priority: src.priority,
          teamRole: src.teamRole,
          workDay: src.workDay,
          referenceMediaIds: src.referenceMediaIds,
          position: src.position + 1,
          createdBy: user.id,
        }),
      )
      .select("id"),
  );
  // Same people on the copy — they're told about it like any new task
  const people = await many<{ staffId: string }>(db.from(tbl(schema.eventTaskAssignees)).select("staffId:staff_id").eq("task_id", id).is("removed_at", null));
  if (people.length) await assign(row.id, people.map((p) => p.staffId), user);
  await audit(user, "create", "task", row.id, `Duplicated task “${src.title}”`);
  return { id: row.id };
});

export const deleteWorkTask = adminAction("events.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const t = await one<{ title: string }>(tasks().delete().eq("id", id).select("title"));
  await audit(user, "delete", "task", id, `Deleted task “${t.title}”`);
});

export const saveTaskInternalNotes = adminAction("events.update", z.object({ taskId: zs.uuid(), notes: zs.optional(2000) }), async ({ taskId, notes }, user) => {
  await saveInternal(taskId, notes, user);
});
