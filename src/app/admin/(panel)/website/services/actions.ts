"use server";

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

const services = () => db.from(tbl(schema.services));

/**
 * Create or edit a service. New services start as drafts (preview, then publish). Once a service
 * has been published its URL name is locked, so links to /services/<slug> keep working.
 */
export const saveService = adminAction(
  "cms.manage",
  z.object({
    id: zs.optUuid(),
    name: zs.required("Name", 120),
    slug: zs.optional(60),
    summary: zs.required("Summary", 300),
    description: zs.required("Description", 4000),
    imageId: zs.optUuid(),
    galleryIds: uuidList(24),
    category: zs.optional(80),
    startingPrice: z
      .union([z.coerce.number().int().min(0).max(100_000_000), z.literal("")])
      .optional()
      .nullable()
      .transform((v) => (v === "" || v === undefined || v === null || v === 0 ? null : v)),
    eventType: zs.optional(60),
    featured: z.boolean().default(false),
    seoTitle: zs.optional(70),
    seoDescription: zs.optional(170),
  }),
  async ({ id, galleryIds, ...input }, user) => {
    const slug = slugify(input.slug || input.name);
    if (!slug) throw new UserError("Give the service a name with letters or numbers.", { name: "Required." });
    const clash = await maybe<{ id: string }>(services().select("id").eq("slug", slug));
    if (clash && clash.id !== id) throw new UserError("Another service already uses that URL name.", { slug: "Already used." });
    const [image] = input.imageId ? await publicMediaIds([input.imageId]) : [null];
    if (input.imageId && !image) throw new UserError("Choose a website image from the media library.", { imageId: "Not a website image." });
    const gallery = await publicMediaIds(galleryIds);
    if (id) {
      const current = await one<{ slug: string; publishedAt: string | null }>(services().select("slug,publishedAt:published_at").eq("id", id));
      if (current.publishedAt && current.slug !== slug) {
        throw new UserError(`This service has been on the website at /services/${current.slug}. Its URL name can't change, so existing links keep working.`, { slug: "Locked after publishing." });
      }
      await exec(services().update(vals(schema.services, { ...input, slug, galleryIds: gallery })).eq("id", id));
    } else {
      const last = await maybe<{ position: number }>(services().select("position").order("position", { ascending: false }).limit(1));
      await exec(services().insert(vals(schema.services, { ...input, slug, galleryIds: gallery, status: "DRAFT", position: (last?.position ?? 0) + 1 })));
    }
    await audit(user, id ? "update" : "create", "service", id ?? null, `${id ? "Updated" : "Added"} service ${input.name}`);
    refreshSite();
  },
);

/** Publish, unpublish (back to draft) or archive a service. */
export const setServiceStatus = adminAction("cms.manage", z.object({ id: zs.uuid(), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }), async ({ id, status }, user) => {
  const s = await one<{ name: string; imageId: string | null; publishedAt: string | null }>(services().select("name,imageId:image_id,publishedAt:published_at").eq("id", id));
  if (status === "PUBLISHED" && !s.imageId) throw new UserError("Add a cover image before publishing — the website only shows services with an image.");
  await exec(services().update({ status, ...(status === "PUBLISHED" && { published_at: s.publishedAt ?? new Date().toISOString() }) }).eq("id", id));
  await recordPublication("service", id, status === "PUBLISHED" ? "PUBLISH" : status === "ARCHIVED" ? "ARCHIVE" : "UNPUBLISH", user, s.name);
  await audit(user, status === "PUBLISHED" ? "publish" : status === "ARCHIVED" ? "archive" : "unpublish", "service", id, `${status === "PUBLISHED" ? "Published" : status === "ARCHIVED" ? "Archived" : "Unpublished"} service ${s.name}`);
  refreshSite();
});

export const moveService = adminAction("cms.manage", z.object({ id: zs.uuid(), direction: z.enum(["up", "down"]) }), async ({ id, direction }, user) => {
  const list = await many<{ id: string }>(services().select("id").order("position").order("id"));
  const i = list.findIndex((x) => x.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  for (const [position, x] of list.entries()) await exec(services().update({ position: position + 1 }).eq("id", x.id));
  await audit(user, "reorder", "service", id, "Reordered services");
  refreshSite();
});

export const saveServiceItem = adminAction(
  "cms.manage",
  z.object({ id: zs.optUuid(), serviceId: zs.uuid(), title: zs.required("Title", 160), description: zs.optional(1000), position: zs.int().default(0) }),
  async ({ id, ...input }, user) => {
    const t = db.from(tbl(schema.serviceItems));
    if (id) await exec(t.update(vals(schema.serviceItems, input)).eq("id", id));
    else await exec(t.insert(vals(schema.serviceItems, input)));
    await audit(user, id ? "update" : "create", "service", input.serviceId, `${id ? "Updated" : "Added"} “${input.title}”`);
    refreshSite();
  },
);

export const deleteServiceItem = adminAction("cms.manage", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const r = await one<{ serviceId: string; title: string }>(db.from(tbl(schema.serviceItems)).delete().eq("id", id).select("serviceId:service_id,title"));
  await audit(user, "delete", "service", r.serviceId, `Removed “${r.title}”`);
  refreshSite();
});
