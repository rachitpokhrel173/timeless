"use server";

import { z } from "zod";
import { db, exec, many, maybe, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { isNavDestination } from "@/lib/content";
import { CMS_SETTINGS, discardDraft, publishDraft, recordPublication, restoreRevision, saveDraft, type Json } from "@/server/cms";
import { refreshSite } from "@/server/revalidate";

/** Content settings edited with the generic editor (business details and navigation have their own forms). */
const CONTENT_SETTINGS = ["about", "faqs", "inquiry_options", "catalogue_meta"] as const;
const scopeKey = z.object({ scope: z.enum(["section", "setting"]), key: z.string().regex(/^[a-z_]{1,40}$/) });
const settingLabel = (key: string) => key.replace(/_/g, " ");

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

/** Save a homepage section as a draft — the live homepage doesn't change until it's published. */
export const saveHomeSection = adminAction("cms.manage", z.object({ key: z.string().regex(/^[a-z_]{1,40}$/), content: z.string() }), async ({ key, content }, user) => {
  const value = await hydrateImages(parseJson(content));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UserError("Invalid section content.");
  const row = await maybe<{ label: string }>(db.from(tbl(schema.homepageSections)).select("label").eq("key", key));
  if (!row) throw new UserError("Section not found.");
  await saveDraft("section", key, value, user);
  await audit(user, "update", "homepage_section", key, `Saved a draft of the homepage “${row.label}” section`);
});

/** Publish a draft (homepage section or website setting) to the live website. */
export const publishContent = adminAction("cms.manage", scopeKey, async ({ scope, key }, user) => {
  if (scope === "setting" && !(CMS_SETTINGS as readonly string[]).includes(key)) throw new UserError("That isn't website content.");
  await publishDraft(scope, key, user);
  await audit(user, "publish", scope === "section" ? "homepage_section" : "setting", key, `Published changes to ${scope === "section" ? `the homepage “${key}” section` : `website ${settingLabel(key)}`}`);
  refreshSite();
});

export const discardContentDraft = adminAction("cms.manage", scopeKey, async ({ scope, key }, user) => {
  await discardDraft(scope, key);
  await audit(user, "discard", scope === "section" ? "homepage_section" : "setting", key, `Discarded unpublished changes to ${settingLabel(key)}`);
});

/** Copy an earlier published version into the draft (it still has to be published). */
export const restoreContentVersion = adminAction("cms.manage", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const rev = await restoreRevision(id, user);
  await audit(user, "restore", rev.scope === "section" ? "homepage_section" : "setting", rev.key, `Restored an earlier version of ${settingLabel(rev.key)} into the draft`);
});

export const setSectionStatus = adminAction("cms.manage", z.object({ key: z.string().min(1).max(40), status: z.enum(["DRAFT", "PUBLISHED"]) }), async ({ key, status }, user) => {
  if (key === "hero" && status === "DRAFT") throw new UserError("The hero is the top of the homepage and can't be hidden — edit it instead.");
  const row = await maybe<{ key: string }>(db.from(tbl(schema.homepageSections)).update({ status, updated_by: user.id }).eq("key", key).select("key"));
  if (!row) throw new UserError("Section not found.");
  await recordPublication("section", key, status === "PUBLISHED" ? "PUBLISH" : "UNPUBLISH", user, status === "PUBLISHED" ? "Shown on the homepage" : "Hidden from the homepage");
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

/** Save page/form content as a draft (published separately). */
export const saveContentSetting = adminAction("cms.manage", z.object({ key: z.enum(CONTENT_SETTINGS), content: z.string() }), async ({ key, content }, user) => {
  const value = await hydrateImages(parseJson(content));
  await saveDraft("setting", key, value, user);
  await audit(user, "update", "setting", key, `Saved a draft of website content “${settingLabel(key)}”`);
});

const httpsUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(500)
    .refine((v) => !v || /^https:\/\/[^\s"'<>]+$/.test(v), `${label} must be a full https:// link.`)
    .default("");

/**
 * Contact details shown across the site (header, footer, contact page, Google structured data).
 * Saved as a draft of the "business" setting; everything not on this form is kept as it is.
 */
export const saveContactDraft = adminAction(
  "cms.manage",
  z.object({
    name: zs.required("Business name", 120),
    email: zs.email(),
    phones: z
      .string()
      .max(500)
      .transform((v) =>
        v
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 5),
      )
      .refine((v) => v.length > 0, "Add at least one phone number."),
    whatsapp: z
      .string()
      .trim()
      .max(20)
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => !v || v.length >= 8, "Enter the WhatsApp number with the country code, e.g. 9779845411029."),
    street: zs.required("Street / area", 120),
    city: zs.required("City", 80),
    postalCode: zs.text(20),
    hours: zs.text(160),
    mapUrl: httpsUrl("The map link"),
  }),
  async (input, user) => {
    const [live, draft] = await Promise.all([
      maybe<{ value: { [k: string]: Json } }>(db.from(tbl(schema.siteSettings)).select("value").eq("key", "business")),
      maybe<{ content: { [k: string]: Json } }>(db.from(tbl(schema.cmsDrafts)).select("content").eq("scope", "setting").eq("key", "business")),
    ]);
    const base = draft?.content ?? live?.value ?? {};
    const address = (base.address && typeof base.address === "object" && !Array.isArray(base.address) ? base.address : {}) as { [k: string]: Json };
    const phones = input.phones.map((line) => {
      const [label, e164] = line.split("|").map((x) => x.trim());
      const digits = (e164 || label || "").replace(/[^\d+]/g, "");
      return { label: label || digits, e164: digits.startsWith("+") ? digits : `+977${digits.replace(/^0/, "")}` };
    });
    const value: { [k: string]: Json } = {
      ...base,
      name: input.name,
      email: input.email,
      phones,
      whatsapp: input.whatsapp,
      address: { ...address, street: input.street, city: input.city, postalCode: input.postalCode },
      hours: input.hours,
      mapUrl: input.mapUrl,
    };
    await saveDraft("setting", "business", value, user);
    await audit(user, "update", "setting", "business", "Saved a draft of the contact details");
  },
);

/** Menu links, footer text and copyright line. Links can only point at public website pages. */
export const saveNavigationDraft = adminAction(
  "cms.manage",
  z.object({
    links: z
      .array(z.object({ label: zs.required("Label", 30), href: z.string().trim().max(130) }))
      .min(1, "Keep at least one menu link.")
      .max(8, "Up to 8 menu links fit in the header."),
    footerText: zs.text(300),
    copyright: zs.text(160),
  }),
  async (input, user) => {
    const bad = input.links.find((l) => !isNavDestination(l.href));
    if (bad) throw new UserError(`“${bad.href}” isn't a website page. Use a page like /services, /gallery or /contact.`);
    if (!input.links.some((l) => l.href === "/contact" || l.href.startsWith("/contact#"))) throw new UserError("Keep a link to the Contact page so visitors can reach you.");
    await saveDraft("setting", "navigation", input as unknown as Json, user);
    await audit(user, "update", "setting", "navigation", "Saved a draft of the menu and footer");
  },
);

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
    ogTitle: zs.optional(90),
    ogDescription: zs.optional(200),
    canonicalPath: z
      .string()
      .trim()
      .max(200)
      .optional()
      .nullable()
      .transform((v) => v || null)
      .refine((v) => !v || /^\/[a-z0-9/_-]*$/.test(v), "Use a site path like /services."),
    noindex: z.boolean().default(false),
  }),
  async (input, user) => {
    if (input.noindex && input.path === "/") throw new UserError("The homepage can't be hidden from search engines.");
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
