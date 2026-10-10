"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, exec, maybe, schema, tbl } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { createInvoice, setInvoiceStatus } from "@/server/finance";

export const createInvoiceAction = adminAction(
  "invoices.create",
  z.object({ bookingId: zs.uuid(), dueDate: zs.date(), notes: zs.optional(2000), send: z.boolean().default(false), open: z.boolean().default(true) }),
  async ({ bookingId, open, ...opts }, user) => {
    const active = await maybe<{ number: string }>(db.from(tbl(schema.invoices)).select("number").eq("booking_id", bookingId).neq("status", "CANCELLED").limit(1));
    if (active) throw new UserError(`${active.number} is already open for this booking — cancel it first to re-issue.`);
    const inv = await createInvoice(db, bookingId, user, opts);
    await audit(user, "create", "invoice", inv.id, `Created invoice ${inv.number}`);
    if (open) redirect(`/admin/invoices/${inv.id}`);
    return { id: inv.id };
  },
);

export const invoiceStatusAction = adminAction("invoices.update", z.object({ id: zs.uuid(), action: z.enum(["SEND", "CANCEL"]) }), async ({ id, action }, user) => {
  const inv = await setInvoiceStatus(db, id, action);
  await audit(user, action === "SEND" ? "send" : "cancel", "invoice", id, `${action === "SEND" ? "Marked as sent" : "Cancelled"} invoice ${inv.number}`);
});

export const updateInvoice = adminAction("invoices.update", z.object({ id: zs.uuid(), dueDate: zs.date(), notes: zs.optional(2000) }), async ({ id, dueDate, notes }, user) => {
  const inv = await maybe<{ number: string; status: string }>(db.from(tbl(schema.invoices)).select("number,status").eq("id", id));
  if (!inv) throw new UserError("Invoice not found.");
  if (inv.status === "CANCELLED") throw new UserError("This invoice is cancelled.");
  await exec(db.from(tbl(schema.invoices)).update({ due_date: dueDate, notes }).eq("id", id));
  await audit(user, "update", "invoice", id, `Updated invoice ${inv.number}`);
});
