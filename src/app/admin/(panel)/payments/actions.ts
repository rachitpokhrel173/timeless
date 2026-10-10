"use server";

import { z } from "zod";
import { db, one, schema, tbl } from "@/db";
import { adminAction, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { npr } from "@/lib/format";
import { sendEmail } from "@/server/email";
import { PAYMENT_METHODS, recordPayment, voidPayment } from "@/server/finance";
import { notify } from "@/server/notifications";

export const recordPaymentAction = adminAction(
  "payments.create",
  z.object({
    bookingId: zs.uuid(),
    invoiceId: zs.optUuid(),
    amount: zs.money(),
    method: z.enum(PAYMENT_METHODS),
    paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the payment date."),
    reference: zs.optional(120),
    notes: zs.optional(1000),
    sendReceipt: z.boolean().default(false),
  }),
  async ({ sendReceipt, ...input }, user) => {
    const r = await recordPayment(db, input, user);
    const c = await one<{ name: string; email: string | null }>(db.from(tbl(schema.customers)).select("name,email").eq("id", r.booking.customerId));
    await audit(user, "create", "payment", r.payment.id, `Recorded ${npr(input.amount)} (${r.payment.number}) on ${r.booking.number}`);
    await notify({
      type: "payment.received",
      title: `Payment received: ${npr(input.amount)}`,
      body: `${r.booking.number} · ${c.name}${r.autoConfirmed ? " · booking confirmed" : ""}`,
      href: `/admin/bookings/${r.booking.id}?tab=payments`,
      entityType: "payment",
      entityId: r.payment.id,
      permission: "payments.view",
    });
    if (sendReceipt) await sendEmail(c.email, "paymentReceipt", { name: c.name, receipt: r.payment.number, amount: input.amount, balance: r.balance, title: r.booking.number }, { entityType: "payment", entityId: r.payment.id });
    return { number: r.payment.number, balance: r.balance, autoConfirmed: r.autoConfirmed };
  },
);

export const voidPaymentAction = adminAction("payments.create", z.object({ id: zs.uuid(), reason: zs.required("Reason", 300) }), async ({ id, reason }, user) => {
  const p = await voidPayment(db, id, reason);
  await audit(user, "void", "payment", id, `Voided payment ${p.number} (${npr(p.amount)}): ${reason}`);
});
