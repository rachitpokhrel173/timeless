"use server";

import { z } from "zod";
import { db, many, maybe, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { npr, todayISO } from "@/lib/format";

const CATEGORIES = ["FLORIST", "PHOTOGRAPHER", "CATERER", "LIGHTING", "SOUND", "TRANSPORT", "PRINTING", "FURNITURE", "OTHER"] as const;

export const saveVendor = adminAction(
  "vendors.manage",
  z.object({
    id: zs.optUuid(),
    name: zs.required("Name", 160),
    category: z.enum(CATEGORIES).default("OTHER"),
    contactPerson: zs.optional(120),
    phone: zs.phone(),
    email: zs.email(),
    address: zs.optional(300),
    defaultCost: zs.money(),
    rating: z
      .union([z.coerce.number().int().min(1).max(5), z.literal("")])
      .optional()
      .nullable()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    paymentInfo: zs.optional(500),
    active: z.boolean().default(true),
  }),
  async ({ id, ...input }, user) => {
    const vendors = db.from(tbl(schema.vendors));
    const row = id ? await one<{ id: string }>(vendors.update(vals(schema.vendors, input)).eq("id", id).select("id")) : await one<{ id: string }>(vendors.insert(vals(schema.vendors, input)).select("id"));
    await audit(user, id ? "update" : "create", "vendor", row.id, `${id ? "Updated" : "Added"} vendor ${input.name}`);
    return { id: row.id };
  },
);

export const archiveVendor = adminAction("vendors.manage", z.object({ id: zs.uuid(), archived: z.boolean() }), async ({ id, archived }, user) => {
  const v = await one<{ name: string }>(db.from(tbl(schema.vendors)).update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).select("name"));
  await audit(user, archived ? "archive" : "restore", "vendor", id, `${archived ? "Archived" : "Restored"} vendor ${v.name}`);
});


/** Pay a vendor: just the amount. Saved as today's expense under the "Vendor" category. */
export const recordVendorPayment = adminAction(
  "expenses.create",
  z.object({ vendorId: zs.uuid(), amount: zs.money().refine((n) => n > 0, "Enter an amount above zero.") }),
  async ({ vendorId, amount }, user) => {
    const vendor = await maybe<{ name: string }>(db.from(tbl(schema.vendors)).select("name").eq("id", vendorId));
    if (!vendor) throw new UserError("Vendor not found.");
    // A double click shouldn't pay twice: the same amount to the same vendor seconds apart is a repeat
    const since = new Date(Date.now() - 15_000).toISOString();
    const repeat = await maybe(db.from(tbl(schema.expenses)).select("id").eq("vendor_id", vendorId).eq("amount", amount).is("voided_at", null).gte("created_at", since).limit(1));
    if (repeat) throw new UserError(`${npr(amount)} was just recorded for this vendor.`);
    const categories = await many<{ id: string; slug: string }>(db.from(tbl(schema.expenseCategories)).select("id,slug").in("slug", ["vendor", "other"]));
    const category = categories.find((c) => c.slug === "vendor") ?? categories[0];
    if (!category) throw new UserError("Add a \"Vendor\" expense category first (Settings).");
    const e = await one<{ id: string }>(
      db
        .from(tbl(schema.expenses))
        .insert(vals(schema.expenses, { categoryId: category.id, description: `Payment to ${vendor.name}`, amount, date: todayISO(), vendorId, method: "CASH", createdBy: user.id }))
        .select("id"),
    );
    await audit(user, "create", "expense", e.id, `Paid ${npr(amount)} to vendor ${vendor.name}`);
  },
);
