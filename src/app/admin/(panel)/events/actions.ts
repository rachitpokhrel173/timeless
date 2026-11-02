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
    theme: zs.optional(200),
    style: zs.optional(200),
    specialInstructions: zs.optional(4000),
    managerId: zs.optUuid(),
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

const designs = () => db.from(tbl(schema.designApprovals));
type DesignRow = Row<typeof schema.designApprovals>;
const DESIGN_FIELDS = {
  title: zs.required("Title", 200),
  description: zs.optional(4000),
  optionLabel: zs.optional(40),
  area: zs.optional(120),
  bookingItemId: zs.optUuid(),
  colorPalette: zs.optional(500),
  flowers: zs.optional(1000),
  stageLayout: zs.optional(2000),
  venueLayout: zs.optional(2000),
  notes: zs.optional(4000),
};

/**
 * Add a design option, or edit one that is still a draft. Once proposed to the client a design
 * is frozen (the database refuses edits) — changes go into a revision.
 */
export const saveDesign = adminAction("events.update", z.object({ id: zs.optUuid(), eventId: zs.uuid(), ...DESIGN_FIELDS }), async ({ id, ...input }, user) => {
  if (id) {
    const d = await maybe<{ status: string }>(designs().select("status").eq("id", id));
    if (!d) throw new UserError("Design not found.");
    if (d.status !== "DRAFT") throw new UserError("This design has already been proposed — create a revision to change it.");
    await exec(designs().update(vals(schema.designApprovals, input)).eq("id", id));
  } else await exec(designs().insert(vals(schema.designApprovals, { ...input, createdBy: user.id })));
  await audit(user, id ? "update" : "create", "event", input.eventId, `${id ? "Updated" : "Added"} design “${input.title}”`);
});

/** A new draft version of a proposed design (files and details copied; the original is kept). */
export const reviseDesign = adminAction("events.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const d = await maybe<DesignRow>(designs().select(cols(schema.designApprovals)).eq("id", id));
  if (!d) throw new UserError("Design not found.");
  if (d.status === "DRAFT") throw new UserError("This design is still a draft — edit it directly.");
  const open = await maybe<{ id: string }>(designs().select("id").eq("parent_id", id).eq("status", "DRAFT").limit(1));
  if (open) throw new UserError("A draft revision of this design already exists.");
  const latest = await maybe<{ version: number }>(designs().select("version").eq("event_id", d.eventId).eq("title", d.title).order("version", { ascending: false }).limit(1));
  const row = await one<{ id: string }>(
    designs()
      .insert(
        vals(schema.designApprovals, {
          eventId: d.eventId,
          title: d.title,
          description: d.description,
          mediaIds: d.mediaIds,
          referenceMediaIds: d.referenceMediaIds,
          version: Math.max(d.version, latest?.version ?? 0) + 1,
          parentId: d.id,
          optionLabel: d.optionLabel,
          area: d.area,
          bookingItemId: d.bookingItemId,
          colorPalette: d.colorPalette,
          flowers: d.flowers,
          stageLayout: d.stageLayout,
          venueLayout: d.venueLayout,
          notes: d.notes,
          createdBy: user.id,
        }),
      )
      .select("id"),
  );
  await audit(user, "create", "event", d.eventId, `Started revision ${Math.max(d.version, latest?.version ?? 0) + 1} of design “${d.title}”`);
  return { id: row.id };
});

const DESIGN_NEXT: Record<string, string[]> = {
  DRAFT: ["SENT"],
  SENT: ["VIEWED", "APPROVED", "REVISION_REQUESTED", "REJECTED"],
  VIEWED: ["APPROVED", "REVISION_REQUESTED", "REJECTED"],
  REVISION_REQUESTED: ["APPROVED", "REJECTED"],
  REJECTED: ["APPROVED"],
  APPROVED: ["REVISION_REQUESTED", "REJECTED"],
};

/**
 * Move a design through proposal → client decision. The database stamps approval (and makes it
 * the selected option for its area) and writes every change to the design's history.
 */
export const setDesignStatus = adminAction(
  "events.update",
  z.object({
    id: zs.uuid(),
    status: z.enum(["SENT", "VIEWED", "APPROVED", "REVISION_REQUESTED", "REJECTED"]),
    response: zs.optional(2000),
    channel: z.enum(["WHATSAPP", "PHONE", "IN_PERSON", "EMAIL", "OTHER", ""]).optional().nullable().transform((v) => v || null),
  }),
  async ({ id, status, response, channel }, user) => {
    const d = await maybe<{ title: string; eventId: string; status: string; mediaIds: string[] }>(designs().select("title,eventId:event_id,status,mediaIds:media_ids").eq("id", id));
    if (!d) throw new UserError("Design not found.");
    if (d.status === status) return;
    if (!DESIGN_NEXT[d.status]?.includes(status)) throw new UserError(`A design that is ${d.status.toLowerCase().replace("_", " ")} can't be marked ${status.toLowerCase().replace("_", " ")}.`);
    if (status === "SENT" && !d.mediaIds.length) throw new UserError("Add the design files before proposing it.");
    if (["APPROVED", "REVISION_REQUESTED", "REJECTED"].includes(status) && !channel) throw new UserError("Say how the client gave their answer.", { channel: "Required." });
    if (status === "REVISION_REQUESTED" && !response) throw new UserError("Write down what the client wants changed.", { response: "Required." });
    await exec(
      designs()
        .update({
          status,
          ...(status === "VIEWED" ? { viewed_at: new Date().toISOString() } : {}),
          ...(["APPROVED", "REVISION_REQUESTED", "REJECTED"].includes(status) ? { client_response: response, decision_channel: channel } : {}),
          ...(status === "SENT" ? { decision_channel: channel } : {}),
        })
        .eq("id", id),
    );
    await audit(user, "status", "event", d.eventId, `Design “${d.title}” → ${status.toLowerCase().replace("_", " ")}${channel ? ` (${channel.toLowerCase().replace("_", " ")})` : ""}`);
  },
);
