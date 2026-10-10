"use server";

import { z } from "zod";
import { db, exec, maybe, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { applyStockOp, checkLowStock } from "@/server/inventory";

const fields = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required.")
    .max(40)
    .transform((v) => v.toUpperCase().replace(/\s+/g, "-")),
  name: zs.required("Name", 160),
  categoryId: zs.optUuid(),
  description: zs.optional(1000),
  unit: zs.text(20).default("pcs"),
  lowStockThreshold: zs.int(),
  consumable: z.boolean().default(false),
  purchaseCost: zs.money(),
  replacementCost: zs.money(),
  rentalPrice: zs.money(),
  supplierId: zs.optUuid(),
  location: zs.optional(120),
});

const items = () => db.from(tbl(schema.inventoryItems));

export const createItem = adminAction("inventory.create", fields.extend({ quantity: zs.int() }), async ({ quantity, ...input }, user) => {
  const row = await one<{ id: string }>(items().insert(vals(schema.inventoryItems, { ...input, unit: input.unit || "pcs" })).select("id"));
  if (quantity > 0) await applyStockOp(db, row.id, "STOCK_IN", quantity, user, "Opening stock");
  await audit(user, "create", "inventory", row.id, `Added inventory item ${input.name} (${input.sku})`);
  return { id: row.id };
});

export const updateItem = adminAction("inventory.update", fields.extend({ id: zs.uuid() }), async ({ id, ...input }, user) => {
  await exec(items().update(vals(schema.inventoryItems, { ...input, unit: input.unit || "pcs" })).eq("id", id));
  await audit(user, "update", "inventory", id, `Updated ${input.name}`);
  await checkLowStock([id]);
});

export const archiveItem = adminAction("inventory.update", z.object({ id: zs.uuid(), archived: z.boolean() }), async ({ id, archived }, user) => {
  if (archived) {
    const held = await maybe<{ id: string }>(db.from(tbl(schema.inventoryReservationItems)).select("id").eq("item_id", id).in("status", ["RESERVED", "CHECKED_OUT"]).limit(1));
    if (held) throw new UserError("This item is reserved for an event — release it first.");
  }
  const it = await one<{ name: string }>(items().update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).select("name"));
  await audit(user, archived ? "archive" : "restore", "inventory", id, `${archived ? "Archived" : "Restored"} ${it.name}`);
});

export const stockOp = adminAction(
  "inventory.adjust",
  z.object({
    id: zs.uuid(),
    op: z.enum(["STOCK_IN", "STOCK_OUT", "DAMAGE", "REPAIRED", "LOSS", "MAINTENANCE_IN", "MAINTENANCE_OUT", "ADJUSTMENT"]),
    quantity: z.coerce.number().int().min(0).max(1_000_000),
    notes: zs.optional(500),
    reference: zs.optional(120),
  }),
  async ({ id, op, quantity, notes, reference }, user) => {
    const next = await applyStockOp(db, id, op, quantity, user, notes, reference);
    await audit(user, "adjust", "inventory", id, `Stock ${op.toLowerCase().replace("_", " ")}: ${quantity}`, { ...next });
    await checkLowStock([id]);
  },
);

export const addCategory = adminAction("inventory.update", z.object({ name: zs.required("Name", 80) }), async ({ name }, user) => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const last = await maybe<{ position: number }>(db.from(tbl(schema.inventoryCategories)).select("position").order("position", { ascending: false }).limit(1));
  await exec(db.from(tbl(schema.inventoryCategories)).insert({ name, slug, position: (last?.position ?? 0) + 1 }));
  await audit(user, "create", "inventory_category", null, `Added inventory category ${name}`);
});
