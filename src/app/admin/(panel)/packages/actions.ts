"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, exec, many, maybe, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { publicMediaIds, recordPublication, uuidList } from "@/server/cms";
import { refreshSite } from "@/server/revalidate";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const lines = (max: number) =>
  z
    .string()
    .max(4000)
    .optional()
    .nullable()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, max),
    );

const fields = z.object({
  name: zs.required("Name", 120),
  slug: zs.optional(60),
  tier: zs.optional(60),
  category: zs.optional(80),
  summary: zs.optional(300),
  description: zs.optional(4000),
  price: zs.money(),
  priceFrom: z.boolean().default(true),
  features: lines(30),
  /** "Photo booth | 15000" — one per line; the price is optional. */
  addOns: lines(20).transform((rows, ctx) =>
    rows.map((row) => {
      const [label, raw] = row.split("|").map((x) => x.trim());
      const price = raw ? Number(raw.replace(/[^\d.]/g, "")) : 0;
      if (!label || !Number.isFinite(price) || price < 0) ctx.addIssue({ code: "custom", message: `Couldn't read the add-on “${row}”. Use “Name | price”.` });
      return { label: (label ?? "").slice(0, 120), price: Math.round(price || 0) };
    }),
  ),
  imageId: zs.optUuid(),
  galleryIds: uuidList(24),
  serviceIds: z.array(zs.uuid()).max(20).default([]),
  eventType: zs.optional(60),
  featured: z.boolean().default(false),
  seoTitle: zs.optional(70),
  seoDescription: zs.optional(170),
});

const packages = () => db.from(tbl(schema.packages));

async function checked(input: z.output<typeof fields>) {
  const [image] = input.imageId ? await publicMediaIds([input.imageId]) : [null];
  if (input.imageId && !image) throw new UserError("Choose a website image from the media library.", { imageId: "Not a website image." });
  const serviceIds = input.serviceIds.length ? (await many<{ id: string }>(db.from(tbl(schema.services)).select("id").in("id", input.serviceIds))).map((s) => s.id) : [];
  return { ...input, galleryIds: await publicMediaIds(input.galleryIds), serviceIds: input.serviceIds.filter((id) => serviceIds.includes(id)) };
}

/** New packages start as drafts; publish them from the package page once they're ready. */
export const createPackage = adminAction(["cms.manage", "inventory.update"], fields, async (input, user) => {
  const slug = slugify(input.slug || input.name);
  if (!slug) throw new UserError("Give the package a name with letters or numbers.", { name: "Required." });
  if (await maybe(packages().select("id").eq("slug", slug))) throw new UserError("Another package already uses that name.", { name: "Already used." });
  const last = await maybe<{ position: number }>(packages().select("position").order("position", { ascending: false }).limit(1));
  const row = await one<{ id: string }>(packages().insert(vals(schema.packages, { ...(await checked(input)), slug, status: "DRAFT", position: (last?.position ?? -1) + 1 })).select("id"));
  await audit(user, "create", "package", row.id, `Created package ${input.name}`);
  refreshSite();
  redirect(`/admin/packages/${row.id}`);
});

/**
 * Edit a package. Quotations and bookings that already use it keep their own copy (snapshot),
 * so nothing agreed with a client changes. The URL name is locked once it has been published.
 */
export const updatePackage = adminAction(["cms.manage", "inventory.update"], fields.extend({ id: zs.uuid() }), async ({ id, ...input }, user) => {
  const slug = slugify(input.slug || input.name);
  const clash = await maybe<{ id: string }>(packages().select("id").eq("slug", slug).neq("id", id));
  if (clash) throw new UserError("Another package already uses that URL name.", { slug: "Already used." });
  const current = await one<{ slug: string; publishedAt: string | null }>(packages().select("slug,publishedAt:published_at").eq("id", id));
  if (current.publishedAt && current.slug !== slug) {
    throw new UserError(`This package has been on the website at /packages/${current.slug}. Its URL name can't change, so existing links keep working.`, { slug: "Locked after publishing." });
  }
  await exec(packages().update(vals(schema.packages, { ...(await checked(input)), slug })).eq("id", id));
  await audit(user, "update", "package", id, `Updated package ${input.name}`);
  refreshSite();
});

/** Publish / unpublish / archive (website editors only — inventory staff can edit contents). */
export const setPackageStatus = adminAction("cms.manage", z.object({ id: zs.uuid(), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }), async ({ id, status }, user) => {
  const p = await one<{ name: string; publishedAt: string | null }>(packages().select("name,publishedAt:published_at").eq("id", id));
  await exec(packages().update({ status, ...(status === "PUBLISHED" && { published_at: p.publishedAt ?? new Date().toISOString() }) }).eq("id", id));
  await recordPublication("package", id, status === "PUBLISHED" ? "PUBLISH" : status === "ARCHIVED" ? "ARCHIVE" : "UNPUBLISH", user, p.name);
  await audit(user, status === "PUBLISHED" ? "publish" : status === "ARCHIVED" ? "archive" : "unpublish", "package", id, `${status === "PUBLISHED" ? "Published" : status === "ARCHIVED" ? "Archived" : "Unpublished"} package ${p.name}`);
  refreshSite();
});

/** Copy a package (details and contents) into a new draft. */
export const duplicatePackage = adminAction(["cms.manage", "inventory.update"], z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const src = await one<Record<string, unknown> & { name: string; slug: string }>(packages().select("*").eq("id", id));
  const base = slugify(`${src.slug}-copy`);
  let slug = base;
  for (let n = 2; await maybe(packages().select("id").eq("slug", slug)); n++) slug = `${base}-${n}`;
  const last = await maybe<{ position: number }>(packages().select("position").order("position", { ascending: false }).limit(1));
  const { id: _id, created_at: _c, updated_at: _u, published_at: _p, ...rest } = src;
  void _id;
  void _c;
  void _u;
  void _p;
  const row = await one<{ id: string }>(packages().insert({ ...rest, name: `${src.name} (copy)`, slug, status: "DRAFT", featured: false, position: (last?.position ?? -1) + 1 }).select("id"));
  const items = await many<{ inventory_item_id: string | null; label: string; quantity: number; position: number }>(
    db.from(tbl(schema.packageItems)).select("inventory_item_id,label,quantity,position").eq("package_id", id).order("position"),
  );
  if (items.length) await exec(db.from(tbl(schema.packageItems)).insert(items.map((i) => ({ ...i, package_id: row.id }))));
  await audit(user, "create", "package", row.id, `Duplicated package ${src.name}`);
  redirect(`/admin/packages/${row.id}`);
});

export const movePackage = adminAction(["cms.manage", "inventory.update"], z.object({ id: zs.uuid(), direction: z.enum(["up", "down"]) }), async ({ id, direction }, user) => {
  const list = await many<{ id: string }>(packages().select("id").order("position").order("id"));
  const i = list.findIndex((x) => x.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  for (const [position, x] of list.entries()) await exec(packages().update({ position }).eq("id", x.id));
  await audit(user, "reorder", "package", id, "Reordered packages");
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
