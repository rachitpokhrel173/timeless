"use server";

import { z } from "zod";
import { cols, db, exec, maybe, one, schema, tbl, vals, type Row } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { onStaffAssigned } from "@/server/automation";
import { checkLowStock, returnReservationItem, setReservations, recheckEventReservations } from "@/server/inventory";
import { eventWindow } from "@/server/sales";

const time = () =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.slice(0, 5) : null))
    .refine((v) => !v || /^\d{2}:\d{2}$/.test(v), "Enter a time like 18:30.");
const optInt = () =>
  z
    .union([z.coerce.number().int().min(0).max(100000), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v));
const events = () => db.from(tbl(schema.events));

export const updateEvent = adminAction(
  "events.update",
  z.object({
    id: zs.uuid(),
    title: zs.required("Title", 200),
    eventType: zs.optional(60),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the event date."),
    startTime: time(),
    endTime: time(),
    setupStart: time(),
    venue: zs.optional(200),
    venueAddress: zs.optional(300),
    guestCount: optInt(),
    colorTheme: zs.optional(200),
    requirements: zs.optional(4000),
    estimatedCost: zs.money(),
    status: z.enum(["PLANNING", "READY"]).optional(),
  }),
  async ({ id, setupStart, status, ...input }, user) => {
    const before = await maybe<Row<typeof schema.events>>(events().select(cols(schema.events)).eq("id", id));
    if (!before) throw new UserError("Event not found.");
    if (["COMPLETED", "CANCELLED"].includes(before.status)) throw new UserError(`This event is ${before.status.toLowerCase()}.`);
    const dateChanged = before.eventDate !== input.eventDate || !!setupStart;
    const window = dateChanged ? eventWindow(input.eventDate, setupStart ?? "07:00") : { startAt: before.startAt, endAt: before.endAt };
    const next = vals(schema.events, { ...input, ...window, ...(status && ["PLANNING", "READY"].includes(before.status) ? { status } : {}) });
    await exec(events().update(next).eq("id", id));
    if (dateChanged) {
      try {
        await recheckEventReservations(db, id);
      } catch (error) {
        // Put the old date back so reservations never overlap
        await exec(events().update(vals(schema.events, { eventDate: before.eventDate, startAt: before.startAt, endAt: before.endAt })).eq("id", id));
        throw error;
      }
    }
    await audit(user, "update", "event", id, `Updated event ${input.title}${dateChanged ? ` (date ${input.eventDate})` : ""}`);
  },
);

/* ───────── Team ───────── */

export const assignStaff = adminAction(
  "events.update",
  z.object({ eventId: zs.uuid(), staffId: zs.uuid(), role: zs.optional(80), days: z.coerce.number().min(0.5).max(30).default(1), notes: zs.optional(500) }),
  async (input, user) => {
    const existing = await maybe<{ id: string }>(db.from(tbl(schema.staffAssignments)).select("id").eq("event_id", input.eventId).eq("staff_id", input.staffId));
    if (existing) await exec(db.from(tbl(schema.staffAssignments)).update(vals(schema.staffAssignments, input)).eq("id", existing.id));
    else await exec(db.from(tbl(schema.staffAssignments)).insert(vals(schema.staffAssignments, input)));
    const person = await one<{ name: string }>(db.from(tbl(schema.staff)).select("name").eq("id", input.staffId));
    await audit(user, "assign", "event", input.eventId, `Assigned ${person.name} to the event`);
    const conflicts = await onStaffAssigned(input.staffId, input.eventId);
    return { conflicts: conflicts.map((c) => c.title) };
  },
);

export const removeStaff = adminAction("events.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const row = await one<{ eventId: string }>(db.from(tbl(schema.staffAssignments)).delete().eq("id", id).select("eventId:event_id"));
  await audit(user, "unassign", "event", row.eventId, "Removed a team member from the event");
});

/* ───────── Vendors ───────── */

export const saveVendorAssignment = adminAction(
  "vendors.manage",
  z.object({
    id: zs.optUuid(),
    eventId: zs.uuid(),
    vendorId: zs.uuid(),
    service: zs.required("Service", 200),
    cost: zs.money(),
    dueDate: zs.date(),
    status: z.enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"]).default("REQUESTED"),
    notes: zs.optional(1000),
  }),
  async ({ id, ...input }, user) => {
    if (id) await exec(db.from(tbl(schema.vendorAssignments)).update(vals(schema.vendorAssignments, input)).eq("id", id));
    else await exec(db.from(tbl(schema.vendorAssignments)).insert(vals(schema.vendorAssignments, input)));
    const v = await one<{ name: string }>(db.from(tbl(schema.vendors)).select("name").eq("id", input.vendorId));
    await audit(user, id ? "update" : "assign", "event", input.eventId, `${id ? "Updated" : "Booked"} ${v.name} for ${input.service}`);
  },
);

/* ───────── Inventory ───────── */

export const reserveItems = adminAction(
  ["inventory.adjust", "bookings.update"],
  z.object({ eventId: zs.uuid(), lines: z.array(z.object({ itemId: zs.uuid(), quantity: z.coerce.number().int().min(0).max(100000) })).min(1).max(300) }),
  async ({ eventId, lines }, user) => {
    await setReservations(db, eventId, lines, user);
    await audit(user, "reserve", "event", eventId, `Updated inventory reservation (${lines.length} item${lines.length === 1 ? "" : "s"})`);
    await checkLowStock(lines.map((l) => l.itemId));
  },
);

export const returnItems = adminAction(
  ["inventory.adjust", "bookings.update"],
  z.object({ id: zs.uuid(), damaged: zs.int(), lost: zs.int(), used: zs.int(), notes: zs.optional(500) }),
  async ({ id, damaged, lost, used, notes }, user) => {
    await returnReservationItem(db, id, damaged, lost, used, user, notes);
    await audit(user, "return", "inventory", id, `Recorded a return (${damaged} damaged, ${lost} lost, ${used} used)`);
  },
);

/* ───────── Run sheet ───────── */

export const saveTimelineItem = adminAction(
  "events.update",
  z.object({
    id: zs.optUuid(),
    eventId: zs.uuid(),
    startsAt: z.string().min(1, "Enter a time."),
    title: zs.required("Title", 200),
    responsibleStaffId: zs.optUuid(),
    notes: zs.optional(500),
  }),
  async ({ id, startsAt, ...input }, user) => {
    const at = new Date(startsAt.length <= 16 ? `${startsAt}:00+05:45` : startsAt);
    if (Number.isNaN(at.getTime())) throw new UserError("Enter a valid time.", { startsAt: "Invalid." });
    const values = vals(schema.eventTimeline, { ...input, startsAt: at });
    if (id) await exec(db.from(tbl(schema.eventTimeline)).update(values).eq("id", id));
    else await exec(db.from(tbl(schema.eventTimeline)).insert(values));
    await audit(user, id ? "update" : "create", "event", input.eventId, `${id ? "Updated" : "Added"} run-sheet item “${input.title}”`);
  },
);

export const setTimelineStatus = adminAction(["events.update", "tasks.update"], z.object({ id: zs.uuid(), status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED", "BLOCKED"]) }), async ({ id, status }) => {
  await exec(db.from(tbl(schema.eventTimeline)).update({ status }).eq("id", id));
});

export const deleteTimelineItem = adminAction("events.update", z.object({ id: zs.uuid() }), async ({ id }) => {
  await exec(db.from(tbl(schema.eventTimeline)).delete().eq("id", id));
});

/* ───────── Notes & designs ───────── */

export const addEventNote = adminAction(
  ["events.update", "tasks.update"],
  z.object({
    eventId: zs.uuid(),
    body: zs.required("Note", 4000),
    // The "share with client" checkbox submits a boolean
    visibility: z
      .union([z.boolean(), z.enum(["INTERNAL", "CLIENT"])])
      .optional()
      .transform((v) => (v === true || v === "CLIENT" ? ("CLIENT" as const) : ("INTERNAL" as const))),
  }),
  async (input, user) => {
    await exec(db.from(tbl(schema.eventNotes)).insert(vals(schema.eventNotes, { ...input, authorId: user.id })));
    await audit(user, "create", "event", input.eventId, input.visibility === "CLIENT" ? "Shared a note with the client" : "Added an event note");
  },
);

export const saveDesign = adminAction(
  "events.update",
  z.object({ id: zs.optUuid(), eventId: zs.uuid(), title: zs.required("Title", 200), description: zs.optional(2000) }),
  async ({ id, ...input }, user) => {
    if (id) await exec(db.from(tbl(schema.designApprovals)).update(vals(schema.designApprovals, input)).eq("id", id));
    else await exec(db.from(tbl(schema.designApprovals)).insert(vals(schema.designApprovals, { ...input, createdBy: user.id })));
    await audit(user, id ? "update" : "create", "event", input.eventId, `${id ? "Updated" : "Added"} design “${input.title}”`);
  },
);

export const setDesignStatus = adminAction(
  "events.update",
  z.object({ id: zs.uuid(), status: z.enum(["DRAFT", "SENT", "APPROVED", "REVISION_REQUESTED"]), response: zs.optional(2000) }),
  async ({ id, status, response }, user) => {
    const d = await maybe<{ title: string; eventId: string; version: number; status: string }>(db.from(tbl(schema.designApprovals)).select("title,eventId:event_id,version,status").eq("id", id));
    if (!d) throw new UserError("Design not found.");
    const now = new Date().toISOString();
    await exec(
      db
        .from(tbl(schema.designApprovals))
        .update({
          status,
          ...(status === "SENT" ? { sent_at: now, version: d.status === "REVISION_REQUESTED" ? d.version + 1 : d.version } : {}),
          ...(["APPROVED", "REVISION_REQUESTED"].includes(status) ? { responded_at: now, client_response: response } : {}),
        })
        .eq("id", id),
    );
    await audit(user, "status", "event", d.eventId, `Design “${d.title}” → ${status.toLowerCase().replace("_", " ")}`);
  },
);
