"use server";

import { z } from "zod";
import { adminDb, db, exec, many, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import type { Permission } from "@/lib/auth/permissions";
import { csvObjects } from "@/lib/csv";
import { findCustomer, phoneKey } from "@/server/crm";
import { nextNumber } from "@/server/numbering";

/*
 * CSV import in two steps: preview (validate every row, nothing written) and commit (validate
 * again, then insert the valid rows as the signed-in user so RLS applies).
 */

type RowError = { row: number; message: string };
type Entity = "customers" | "leads" | "inventory";
const PERMISSION: Record<Entity, Permission> = { customers: "customers.create", leads: "leads.create", inventory: "inventory.create" };
const opt = (s?: string) => (s && s.trim() ? s.trim() : null);

async function validate(entity: Entity, csv: string) {
  if (csv.length > 2_000_000) throw new UserError("That file is too large (2 MB max). Split it into smaller files.");
  const { headers, rows } = csvObjects(csv);
  if (!rows.length) throw new UserError("The file has no data rows.");
  if (rows.length > 2000) throw new UserError("Import up to 2,000 rows at a time.");
  const required = { customers: ["name"], leads: ["name"], inventory: ["sku", "name"] }[entity];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) throw new UserError(`Missing column(s): ${missing.join(", ")}. Download the template for the expected columns.`);

  const [sources, categories] = await Promise.all([
    many<{ key: string; name: string }>(adminDb.from(tbl(schema.campaignSources)).select("key,name")),
    many<{ id: string; slug: string; name: string }>(adminDb.from(tbl(schema.inventoryCategories)).select("id,slug,name")),
  ]);
  const existingSkus =
    entity === "inventory"
      ? new Set(
          (
            await many<{ sku: string }>(
              adminDb
                .from(tbl(schema.inventoryItems))
                .select("sku")
                .in(
                  "sku",
                  rows.map((r) => r.sku?.toUpperCase()).filter(Boolean),
                ),
            )
          ).map((r) => r.sku),
        )
      : new Set<string>();

  const errors: RowError[] = [];
  const valid: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const line = i + 2; // header is row 1
    const problems: string[] = [];
    const name = r.name?.trim();
    if (!name || name.length < 2) problems.push("name is required");
    let row: Record<string, unknown> = {};

    if (entity === "customers" || entity === "leads") {
      const phone = opt(r.phone);
      const email = opt(r.email)?.toLowerCase() ?? null;
      if (!phone && !email) problems.push("phone or email is required");
      if (phone && !/^\+?[\d\s()-]{7,}$/.test(phone)) problems.push(`phone “${phone}” isn't valid`);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`email “${email}” isn't valid`);
      const rawSource = opt(r.source);
      const source = rawSource ? sources.find((s) => s.key === rawSource.toUpperCase().replace(/[\s-]/g, "_") || s.name.toLowerCase() === rawSource.toLowerCase()) : null;
      if (rawSource && !source) problems.push(`source “${rawSource}” isn't one of: ${sources.map((s) => s.name).join(", ")}`);
      const key = phoneKey(phone) || email || "";
      if (key && seen.has(key)) problems.push("duplicate of an earlier row");
      seen.add(key);
      if (entity === "customers") row = { name, phone, email, address: opt(r.address), sourceKey: source?.key ?? null };
      else {
        const date = opt(r.eventdate);
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`event date “${date}” must be YYYY-MM-DD`);
        row = { name, phone, email, eventType: opt(r.eventtype)?.toLowerCase().replace(/\s+/g, "-") ?? null, eventDate: date, location: opt(r.location), guestCount: opt(r.guests), budget: opt(r.budget), sourceKey: source?.key ?? "OTHER" };
      }
    } else {
      const sku = r.sku?.trim().toUpperCase();
      if (!sku) problems.push("SKU is required");
      else if (existingSkus.has(sku)) problems.push(`SKU ${sku} already exists`);
      else if (seen.has(sku)) problems.push(`SKU ${sku} appears twice`);
      if (sku) seen.add(sku);
      const rawCat = opt(r.category) ?? "other";
      const category = categories.find((c) => c.slug === rawCat.toLowerCase() || c.name.toLowerCase() === rawCat.toLowerCase());
      if (!category) problems.push(`category “${rawCat}” isn't one of: ${categories.map((c) => c.name).join(", ")}`);
      const int = (v: string | undefined, label: string) => {
        if (!v) return 0;
        const n = Number(v.replace(/,/g, ""));
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) problems.push(`${label} “${v}” must be a whole number`);
        return n;
      };
      row = {
        sku,
        name,
        categoryId: category?.id ?? null,
        quantity: int(r.quantity, "quantity"),
        lowStockThreshold: int(r.lowstock ?? r.minstock, "low stock"),
        unit: opt(r.unit) ?? "pcs",
        purchaseCost: int(r.purchasecost, "purchase cost"),
        replacementCost: int(r.replacementcost, "replacement cost"),
        rentalPrice: int(r.rentalprice, "rental price"),
        location: opt(r.location),
      };
    }
    if (problems.length) errors.push({ row: line, message: problems.join("; ") });
    else valid.push(row);
  }
  return { total: rows.length, valid, errors };
}

const input = z.object({ entity: z.enum(["customers", "leads", "inventory"]), csv: z.string().max(2_100_000) });

export const previewImport = adminAction(["customers.create", "leads.create", "inventory.create"], input, async ({ entity, csv }, user) => {
  if (!user.permissions.has(PERMISSION[entity])) throw new UserError("You don't have permission to import these records.");
  const { total, valid, errors } = await validate(entity, csv);
  return { total, valid: valid.length, errors: errors.slice(0, 200), moreErrors: Math.max(0, errors.length - 200) };
});

export const commitImport = adminAction(["customers.create", "leads.create", "inventory.create"], input.extend({ skipInvalid: z.boolean() }), async ({ entity, csv, skipInvalid }, user) => {
  if (!user.permissions.has(PERMISSION[entity])) throw new UserError("You don't have permission to import these records.");
  const { valid, errors } = await validate(entity, csv);
  if (errors.length && !skipInvalid) throw new UserError(`${errors.length} row(s) have problems. Fix them or choose to skip them.`);
  let created = 0;
  let skipped = 0;
  for (const data of valid) {
    if (entity === "customers") {
      if (await findCustomer(db, data.phone as string | null, data.email as string | null)) {
        skipped++;
        continue;
      }
      await exec(db.from(tbl(schema.customers)).insert(vals(schema.customers, data as typeof schema.customers.$inferInsert)));
    } else if (entity === "leads") {
      const existing = await findCustomer(db, data.phone as string | null, data.email as string | null);
      await exec(db.from(tbl(schema.leads)).insert(vals(schema.leads, { ...(data as typeof schema.leads.$inferInsert), customerId: existing?.id, number: await nextNumber("LD", db) })));
    } else {
      const item = await one<{ id: string; quantity: number }>(
        db
          .from(tbl(schema.inventoryItems))
          .insert(vals(schema.inventoryItems, data as typeof schema.inventoryItems.$inferInsert))
          .select("id,quantity"),
      );
      if (item.quantity > 0) {
        await exec(
          db.from(tbl(schema.inventoryMovements)).insert(vals(schema.inventoryMovements, { itemId: item.id, type: "STOCK_IN", quantity: item.quantity, reference: "CSV import", userId: user.id })),
        );
      }
    }
    created++;
  }
  await audit(user, "import", entity, null, `Imported ${created} ${entity} from CSV${skipped ? ` (${skipped} already existed)` : ""}${errors.length ? `, skipped ${errors.length} invalid row(s)` : ""}`);
  return { created, skipped, invalid: errors.length };
});
