"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, exec, maybe, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { refreshSite } from "@/server/revalidate";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const fields = z.object({
  name: zs.required("Name", 120),
  slug: zs.optional(60),
  tier: zs.optional(60),
  summary: zs.optional(300),
  description: zs.optional(4000),
  price: zs.money(),
  priceFrom: z.boolean().default(true),
  features: z
    .string()
    .max(4000)
    .optional()
    .nullable()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 30),
    ),
  imageId: zs.optUuid(),
  eventType: zs.optional(60),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  featured: z.boolean().default(false),
  position: zs.int().default(0),
});

const packages = () => db.from(tbl(schema.packages));

export const createPackage = adminAction(["cms.manage", "inventory.update"], fields, async (input, user) => {
  const slug = slugify(input.slug || input.name);
  if (await maybe(packages().select("id").eq("slug", slug))) throw new UserError("Another package already uses that name.", { name: "Already used." });
  const row = await one<{ id: string }>(packages().insert(vals(schema.packages, { ...input, slug })).select("id"));
  await audit(user, "create", "package", row.id, `Created package ${input.name}`);
  refreshSite();
  redirect(`/admin/packages/${row.id}`);
});

export const updatePackage = adminAction(["cms.manage", "inventory.update"], fields.extend({ id: zs.uuid() }), async ({ id, ...input }, user) => {
  const slug = slugify(input.slug || input.name);
  const clash = await maybe<{ id: string }>(packages().select("id").eq("slug", slug).neq("id", id));
  if (clash) throw new UserError("Another package already uses that URL name.", { slug: "Already used." });
  await exec(packages().update(vals(schema.packages, { ...input, slug })).eq("id", id));
  await audit(user, "update", "package", id, `Updated package ${input.name}`);
  refreshSite();
});

export const savePackageItem = adminAction(
  ["cms.manage", "inventory.update"],
  z.object({ id: zs.optUuid(), packageId: zs.uuid(), label: zs.required("Label", 160), inventoryItemId: zs.optUuid(), quantity: z.coerce.number().int().min(1).max(10000) }),
  async ({ id, ...input }, user) => {
    if (id) await exec(db.from(tbl(schema.packageItems)).update(vals(schema.packageItems, input)).eq("id", id));
    else {
      const last = await maybe<{ position: number }>(db.from(tbl(schema.packageItems)).select("position").eq("package_id", input.packageId).order("position", { ascending: false }).limit(1));
      await exec(db.from(tbl(schema.packageItems)).insert(vals(schema.packageItems, { ...input, position: (last?.position ?? -1) + 1 })));
    }
    await audit(user, id ? "update" : "create", "package", input.packageId, `${id ? "Updated" : "Added"} “${input.label}” in a package`);
    refreshSite();
  },
);

export const deletePackageItem = adminAction(["cms.manage", "inventory.update"], z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const row = await one<{ packageId: string; label: string }>(db.from(tbl(schema.packageItems)).delete().eq("id", id).select("packageId:package_id,label"));
  await audit(user, "delete", "package", row.packageId, `Removed “${row.label}” from a package`);
  refreshSite();
});
