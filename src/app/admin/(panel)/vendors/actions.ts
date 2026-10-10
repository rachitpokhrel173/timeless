"use server";

import { z } from "zod";
import { db, one, schema, tbl, vals } from "@/db";
import { adminAction, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";

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
    notes: zs.optional(2000),
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

