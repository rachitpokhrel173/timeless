"use server";

import { z } from "zod";
import { cols, db, many, maybe, one, schema, tbl, vals, type Row } from "@/db";
import { adminAction, UserError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import type { Permission } from "@/lib/auth/permissions";

/** Who may add notes to each kind of record (RLS additionally requires a staff role). */
const ENTITY_PERMISSION: Record<string, Permission> = {
  lead: "leads.update",
  inquiry: "leads.update",
  customer: "customers.update",
  quotation: "quotations.update",
  booking: "bookings.update",
  event: "events.update",
  vendor: "vendors.manage",
  staff: "staff.manage",
  inventory: "inventory.update",
};
const entity = z.enum(["lead", "inquiry", "customer", "quotation", "booking", "event", "vendor", "staff", "inventory"]);

export const addNote = adminAction(null, z.object({ entityType: entity, entityId: z.string().uuid(), body: z.string().trim().min(1, "Write a note first.").max(4000) }), async (input, user) => {
  if (!user.permissions.has(ENTITY_PERMISSION[input.entityType])) throw new UserError("You don't have permission to add notes here.");
  const note = await one<{ id: string }>(
    db
      .from(tbl(schema.internalNotes))
      .insert(vals(schema.internalNotes, { ...input, authorId: user.id }))
      .select("id"),
  );
  await audit(user, "create", "note", note.id, `Added an internal note to a ${input.entityType}`, { entityId: input.entityId });
});

export const toggleNotePin = adminAction(null, z.object({ id: z.string().uuid() }), async ({ id }, user) => {
  const note = await maybe<Row<typeof schema.internalNotes>>(db.from(tbl(schema.internalNotes)).select(cols(schema.internalNotes)).eq("id", id));
  if (!note || !user.permissions.has(ENTITY_PERMISSION[note.entityType])) throw new UserError("Note not found.");
  const updated = await many<{ id: string }>(
    db
      .from(tbl(schema.internalNotes))
      .update({ pinned: !note.pinned })
      .eq("id", id)
      .select("id"),
  );
  if (!updated.length) throw new UserError("Only the author or an administrator can change this note.");
});

export const deleteNote = adminAction(null, z.object({ id: z.string().uuid() }), async ({ id }, user) => {
  // RLS: the author or a user manager can update (soft-delete) a note
  const updated = await many<{ entityType: string }>(
    db
      .from(tbl(schema.internalNotes))
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("entityType:entity_type"),
  );
  if (!updated.length) throw new UserError("Only the author or an administrator can delete this note.");
  await audit(user, "delete", "note", id, `Deleted an internal note on a ${updated[0].entityType}`);
});
