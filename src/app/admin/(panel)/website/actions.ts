"use server";

import { z } from "zod";
import { db, exec, many, maybe, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { refreshSite } from "@/server/revalidate";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Content settings the website editor may change (all public, shown on the site). */
const CONTENT_SETTINGS = ["about", "faqs", "inquiry_options", "catalogue_meta"] as const;

/**
 * Images picked in the editor carry a media id; fill in the authoritative URL and size from the
 * media library so the site never trusts client-supplied URLs.
 */
async function hydrateImages(value: Json): Promise<Json> {
  const ids = new Set<string>();
  const walk = (v: Json) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if (typeof v.mediaId === "string") ids.add(v.mediaId);
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  const rows = ids.size ? await many<{ id: string; url: string | null; width: number | null; height: number | null }>(db.from(tbl(schema.media)).select("id,url,width,height").in("id", [...ids])) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const fill = (v: Json): Json => {
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === "object") {
      const out: { [k: string]: Json } = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
      const m = typeof v.mediaId === "string" ? byId.get(v.mediaId) : undefined;
      if (m?.url) Object.assign(out, { src: m.url, width: m.width ?? 1600, height: m.height ?? 1067 });
      return out;
    }
    if (typeof v === "string") return v.slice(0, 5000);
    return v;
  };
  return fill(value);
}

function parseJson(raw: string): Json {
  if (raw.length > 200_000) throw new UserError("That content is too large.");
  try {
    return JSON.parse(raw) as Json;
  } catch {
    throw new UserError("The content couldn't be read. Reload and try again.");
  }
}

export const saveHomeSection = adminAction("cms.manage", z.object({ key: z.string().min(1).max(40), content: z.string() }), async ({ key, content }, user) => {
  const value = await hydrateImages(parseJson(content));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UserError("Invalid section content.");
  const row = await maybe<{ label: string }>(db.from(tbl(schema.homepageSections)).update({ content: value, updated_by: user.id }).eq("key", key).select("label"));
  if (!row) throw new UserError("Section not found.");
  await audit(user, "update", "homepage_section", key, `Edited the homepage “${row.label}” section`);
  refreshSite();
});

export const setSectionStatus = adminAction("cms.manage", z.object({ key: z.string().min(1).max(40), status: z.enum(["DRAFT", "PUBLISHED"]) }), async ({ key, status }, user) => {
  await exec(db.from(tbl(schema.homepageSections)).update({ status, updated_by: user.id }).eq("key", key));
  await audit(user, status === "PUBLISHED" ? "publish" : "unpublish", "homepage_section", key, `${status === "PUBLISHED" ? "Showed" : "Hid"} the homepage “${key}” section`);
  refreshSite();
});

export const moveSection = adminAction("cms.manage", z.object({ key: z.string().min(1).max(40), direction: z.enum(["up", "down"]) }), async ({ key, direction }, user) => {
  const all = await many<{ key: string; position: number }>(db.from(tbl(schema.homepageSections)).select("key,position").neq("key", "offer").order("position"));
  const i = all.findIndex((s) => s.key === key);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j]!, all[i]!];
  for (const [position, s] of all.entries()) await exec(db.from(tbl(schema.homepageSections)).update({ position }).eq("key", s.key));
  await audit(user, "reorder", "homepage_section", key, "Reordered homepage sections");
  refreshSite();
});

export const saveContentSetting = adminAction("cms.manage", z.object({ key: z.enum(CONTENT_SETTINGS), content: z.string() }), async ({ key, content }, user) => {
  const value = await hydrateImages(parseJson(content));
  await exec(db.from(tbl(schema.siteSettings)).upsert({ key, value, is_public: true, updated_by: user.id }, { onConflict: "key" }));
  await audit(user, "update", "setting", key, `Edited website content “${key.replace("_", " ")}”`);
  refreshSite();
});

export const savePageSeo = adminAction(
  "cms.manage",
  z.object({
    path: z
      .string()
      .trim()
      .regex(/^\/[a-z0-9\-/]*$/i, "Use a site path like /services."),
    title: zs.optional(70),
    description: zs.optional(170),
    ogImageId: zs.optUuid(),
    noindex: z.boolean().default(false),
  }),
  async (input, user) => {
    await exec(db.from(tbl(schema.seoSettings)).upsert(vals(schema.seoSettings, input), { onConflict: "path" }));
    await audit(user, "update", "seo", input.path, `Updated SEO for ${input.path}`);
    refreshSite();
  },
);

export const saveSeoGlobal = adminAction(
  "cms.manage",
  z.object({
    homeTitle: zs.required("Title", 70),
    homeDescription: zs.required("Description", 170),
    keywords: z
      .string()
      .max(1000)
      .optional()
      .nullable()
      .transform((v) =>
        (v ?? "")
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 30),
      ),
  }),
  async (value, user) => {
    await exec(db.from(tbl(schema.siteSettings)).upsert({ key: "seo_global", value, is_public: true, updated_by: user.id }, { onConflict: "key" }));
    await audit(user, "update", "setting", "seo_global", "Updated default SEO");
    refreshSite();
  },
);

export const saveSocialLink = adminAction(
  "cms.manage",
  z.object({
    id: zs.optUuid(),
    // The site's icons support these platforms (types/site.ts SocialPlatform)
    platform: z.enum(["instagram", "facebook", "tiktok"]),
    label: zs.required("Label", 60),
    url: z
      .string()
      .trim()
      .max(300)
      .refine((v) => !v || /^https:\/\//.test(v), "Use a full https:// link.")
      .default(""),
    handle: zs.optional(80),
    position: zs.int().default(0),
  }),
  async ({ id, ...input }, user) => {
    const t = db.from(tbl(schema.socialLinks));
    if (id) await exec(t.update(vals(schema.socialLinks, input)).eq("id", id));
    else await exec(t.insert(vals(schema.socialLinks, input)));
    await audit(user, id ? "update" : "create", "social_link", id ?? null, `${id ? "Updated" : "Added"} ${input.label} link`);
    refreshSite();
  },
);

export const deleteSocialLink = adminAction("cms.manage", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  await exec(db.from(tbl(schema.socialLinks)).delete().eq("id", id));
  await audit(user, "delete", "social_link", id, "Removed a social link");
  refreshSite();
});
