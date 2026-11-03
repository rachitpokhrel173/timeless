"use server";

import { z } from "zod";
import { db, exec, maybe, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { npr, todayISO } from "@/lib/format";
import { ALL_METHODS } from "@/lib/finance";

const fields = {
  categoryId: zs.uuid(),
  description: zs.required("Description", 300),
  amount: zs.money().refine((n) => n > 0, "Enter an amount above zero."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date."),
  payee: zs.optional(160),
  vendorId: zs.optUuid(),
  vendorAssignmentId: zs.optUuid(),
  bookingId: zs.optUuid(),
  eventId: zs.optUuid(),
  method: z.enum(ALL_METHODS).default("CASH"),
  notes: zs.optional(1000),
};

type ExpenseInput = { date: string; vendorAssignmentId?: string | null; vendorId?: string | null; eventId?: string | null; bookingId?: string | null };

/** Shared checks: no future dates, and a vendor payment is tied to that vendor booking's vendor and event. */
async function normalise<T extends ExpenseInput>(input: T): Promise<T> {
  if (input.date > todayISO(1)) throw new UserError("The date can't be in the future.", { date: "In the future." });
  if (input.vendorAssignmentId) {
    const va = await maybe<{ vendorId: string; eventId: string }>(db.from(tbl(schema.vendorAssignments)).select("vendorId:vendor_id,eventId:event_id").eq("id", input.vendorAssignmentId));
    if (!va) throw new UserError("Vendor booking not found.");
    input.vendorId = va.vendorId;
    input.eventId = va.eventId;
  }
  // The database fills in the other side (booking ↔ event) and rejects a mismatched pair.
  return input;
}

export const saveExpense = adminAction("expenses.create", z.object(fields), async (raw, user) => {
  const input = await normalise(raw);
  const e = await one<{ id: string }>(db.from(tbl(schema.expenses)).insert(vals(schema.expenses, { ...input, createdBy: user.id })).select("id"));
  await audit(user, "create", "expense", e.id, `Recorded expense ${npr(input.amount)} — ${input.description}${input.payee ? ` (paid to ${input.payee})` : ""}`);
  return { id: e.id };
});

const AUDITED = ["categoryId", "description", "amount", "date", "payee", "vendorId", "vendorAssignmentId", "bookingId", "eventId", "method", "notes"] as const;
const COLS: Record<(typeof AUDITED)[number], string> = {
  categoryId: "category_id",
  description: "description",
  amount: "amount",
  date: "date",
  payee: "payee",
  vendorId: "vendor_id",
  vendorAssignmentId: "vendor_assignment_id",
  bookingId: "booking_id",
  eventId: "event_id",
  method: "method",
  notes: "notes",
};

/** Edit an expense. Every changed field is written to the audit log as old → new. */
export const updateExpense = adminAction("expenses.create", z.object({ id: zs.uuid(), ...fields }), async ({ id, ...raw }, user) => {
  const before = await maybe<Record<string, unknown> & { voidedAt: string | null }>(
    db
      .from(tbl(schema.expenses))
      .select(`${AUDITED.map((k) => `${k}:${COLS[k]}`).join(",")},voidedAt:voided_at`)
      .eq("id", id),
  );
  if (!before) throw new UserError("Expense not found.");
  if (before.voidedAt) throw new UserError("Restore this expense before editing it.");
  const input = await normalise(raw);
  const next: Record<string, unknown> = { ...input };
  // An event changed without a booking: let the database re-derive the booking from the new event.
  if (input.eventId !== before.eventId && input.bookingId === before.bookingId) next.bookingId = null;
  if (input.bookingId !== before.bookingId && input.eventId === before.eventId) next.eventId = null;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of AUDITED) {
    const a = before[k] ?? null;
    const b = next[k] ?? null;
    if (String(a) !== String(b)) changes[k] = { from: a, to: b };
  }
  if (!Object.keys(changes).length) return { id, changed: 0 };
  await exec(db.from(tbl(schema.expenses)).update({ ...vals(schema.expenses, next), updated_at: new Date().toISOString(), updated_by: user.id }).eq("id", id));
  await audit(user, "update", "expense", id, `Edited expense ${npr(input.amount)} — ${input.description} (${Object.keys(changes).join(", ")})`, { changes });
  return { id, changed: Object.keys(changes).length };
});

export const voidExpense = adminAction("expenses.create", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const e = await one<{ description: string; amount: number }>(db.from(tbl(schema.expenses)).update({ voided_at: new Date().toISOString() }).eq("id", id).is("voided_at", null).select("description,amount"));
  await audit(user, "void", "expense", id, `Voided expense ${npr(e.amount)} — ${e.description}`);
});

export const restoreExpense = adminAction("expenses.create", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  await exec(db.from(tbl(schema.expenses)).update({ voided_at: null }).eq("id", id));
  await audit(user, "restore", "expense", id, "Restored a voided expense");
});
