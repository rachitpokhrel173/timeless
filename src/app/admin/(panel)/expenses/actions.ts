"use server";

import { z } from "zod";
import { db, exec, maybe, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { npr, todayISO } from "@/lib/format";
import { PAYMENT_METHODS } from "@/server/finance";

export const saveExpense = adminAction(
  "expenses.create",
  z.object({
    categoryId: zs.uuid(),
    description: zs.required("Description", 300),
    amount: zs.money().refine((n) => n > 0, "Enter an amount above zero."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date."),
    vendorId: zs.optUuid(),
    vendorAssignmentId: zs.optUuid(),
    eventId: zs.optUuid(),
    method: z.enum(PAYMENT_METHODS).default("CASH"),
    notes: zs.optional(1000),
  }),
  async (input, user) => {
    if (input.date > todayISO(1)) throw new UserError("The date can't be in the future.", { date: "In the future." });
    // A vendor payment is tied to that vendor booking's vendor and event
    if (input.vendorAssignmentId) {
      const va = await maybe<{ vendorId: string; eventId: string }>(db.from(tbl(schema.vendorAssignments)).select("vendorId:vendor_id,eventId:event_id").eq("id", input.vendorAssignmentId));
      if (!va) throw new UserError("Vendor booking not found.");
      input.vendorId = va.vendorId;
      input.eventId = va.eventId;
    }
    const e = await one<{ id: string }>(db.from(tbl(schema.expenses)).insert(vals(schema.expenses, { ...input, createdBy: user.id })).select("id"));
    await audit(user, "create", "expense", e.id, `Recorded expense ${npr(input.amount)} — ${input.description}`);
    return { id: e.id };
  },
);

export const voidExpense = adminAction("expenses.create", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const e = await one<{ description: string; amount: number }>(db.from(tbl(schema.expenses)).update({ voided_at: new Date().toISOString() }).eq("id", id).is("voided_at", null).select("description,amount"));
  await audit(user, "void", "expense", id, `Voided expense ${npr(e.amount)} — ${e.description}`);
});

export const restoreExpense = adminAction("expenses.create", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  await exec(db.from(tbl(schema.expenses)).update({ voided_at: null }).eq("id", id));
  await audit(user, "restore", "expense", id, "Restored a voided expense");
});
