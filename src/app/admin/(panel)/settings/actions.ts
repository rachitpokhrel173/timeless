"use server";

import { z } from "zod";
import { db, exec, maybe, many, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { runScheduledAutomations } from "@/server/automation";
import { refreshSite } from "@/server/revalidate";

async function putSetting(key: string, value: unknown, isPublic: boolean, userId: string) {
  await exec(db.from(tbl(schema.siteSettings)).upsert({ key, value, is_public: isPublic, updated_by: userId }, { onConflict: "key" }));
}

const lines = (max = 30) =>
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

export const saveBusiness = adminAction(
  "settings.manage",
  z.object({
    name: zs.required("Business name", 120),
    shortName: zs.required("Short name", 60),
    tagline: zs.text(120),
    title: zs.required("Site title", 90),
    description: zs.required("Description", 300),
    email: zs.email(),
    phones: lines(5),
    whatsapp: z
      .string()
      .trim()
      .max(20)
      .transform((v) => v.replace(/\D/g, "")),
    whatsappMessage: zs.text(300),
    street: zs.text(120),
    city: zs.text(80),
    region: zs.text(80),
    postalCode: zs.text(20),
    country: zs.text(60).default("Nepal"),
    areaServed: z
      .string()
      .max(500)
      .optional()
      .nullable()
      .transform((v) =>
        (v ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    announcement: zs.text(160),
    currency: zs.text(8).default("NPR"),
    timezone: zs.text(60).default("Asia/Kathmandu"),
    logoId: zs.optUuid(),
    logoOnDarkId: zs.optUuid(),
  }),
  async (input, user) => {
    const current = (await maybe<{ value: Record<string, unknown> }>(db.from(tbl(schema.siteSettings)).select("value").eq("key", "business")))?.value ?? {};
    const phones = input.phones.map((l) => {
      const [label, e164] = l.split("|").map((s) => s.trim());
      const digits = (e164 || label || "").replace(/[^\d+]/g, "");
      return { label: label || digits, e164: digits.startsWith("+") ? digits : `+977${digits.replace(/^0/, "")}` };
    });
    const logo = async (id: string | null, fallback: unknown) => {
      if (!id) return fallback;
      const m = await maybe<{ url: string | null; alt: string; width: number | null; height: number | null }>(db.from(tbl(schema.media)).select("url,alt,width,height").eq("id", id));
      return m?.url ? { src: m.url, alt: m.alt || input.name, width: m.width ?? 300, height: m.height ?? 300, mediaId: id } : fallback;
    };
    const value = {
      ...current,
      name: input.name,
      shortName: input.shortName,
      tagline: input.tagline,
      title: input.title,
      description: input.description,
      email: input.email ?? "",
      phones,
      whatsapp: input.whatsapp,
      whatsappMessage: input.whatsappMessage,
      address: { ...((current.address as object) ?? {}), street: input.street, city: input.city, region: input.region, postalCode: input.postalCode, country: input.country },
      areaServed: input.areaServed,
      announcement: input.announcement,
      currency: input.currency || "NPR",
      timezone: input.timezone || "Asia/Kathmandu",
      logo: await logo(input.logoId, current.logo),
      logoOnDark: await logo(input.logoOnDarkId, current.logoOnDark),
    };
    await putSetting("business", value, true, user.id);
    await audit(user, "settings", "setting", "business", "Updated business details");
    refreshSite();
  },
);

export const saveQuotationSettings = adminAction(
  "settings.manage",
  z.object({
    terms: zs.text(8000),
    termsVersion: zs.text(40),
    taxRate: z.coerce.number().min(0).max(100),
    depositPercent: z.coerce.number().min(0).max(100),
    validityDays: z.coerce.number().int().min(1).max(365),
  }),
  async (value, user) => {
    await putSetting("quotation_settings", value, false, user.id);
    await audit(user, "settings", "setting", "quotation_settings", "Updated quotation defaults");
  },
);

export const saveInvoiceSettings = adminAction(
  "settings.manage",
  z.object({ dueDays: z.coerce.number().int().min(0).max(365), notes: zs.text(1000), bankDetails: zs.text(1000) }),
  async (value, user) => {
    await putSetting("invoice_settings", value, false, user.id);
    await audit(user, "settings", "setting", "invoice_settings", "Updated invoice settings");
  },
);

export const saveNotificationSettings = adminAction("settings.manage", z.object({ emailNewInquiry: z.boolean(), emailPaymentReceived: z.boolean() }), async (value, user) => {
  await putSetting("notification_settings", value, false, user.id);
  await audit(user, "settings", "setting", "notification_settings", "Updated notification settings");
});

export const saveAutomationRule = adminAction(
  "settings.manage",
  z.object({ key: z.string().min(1).max(60), enabled: z.boolean(), daysBefore: z.coerce.number().int().min(0).max(60).optional(), flag: z.boolean().optional() }),
  async ({ key, enabled, daysBefore, flag }, user) => {
    const rule = await maybe<{ name: string; config: Record<string, number | boolean | string> }>(db.from(tbl(schema.automationRules)).select("name,config").eq("key", key));
    if (!rule) throw new UserError("Automation not found.");
    const config = { ...rule.config };
    if ("daysBefore" in config && daysBefore !== undefined) config.daysBefore = daysBefore;
    const flagKey = Object.keys(config).find((k) => typeof config[k] === "boolean");
    if (flagKey && flag !== undefined) config[flagKey] = flag;
    await exec(db.from(tbl(schema.automationRules)).update({ enabled, config }).eq("key", key));
    await audit(user, "settings", "automation", key, `${enabled ? "Enabled" : "Disabled"} automation “${rule.name}”`);
  },
);

export const runAutomationsNow = adminAction("settings.manage", z.object({}), async (_input, user) => {
  const results = await runScheduledAutomations();
  await audit(user, "run", "automation", null, "Ran daily automations manually");
  return { results };
});

/* ───────── Lists ───────── */

export const saveSource = adminAction(
  ["settings.manage", "marketing.manage"],
  z.object({
    key: z
      .string()
      .trim()
      .min(2)
      .max(30)
      .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]+/g, "_")),
    name: zs.required("Name", 60),
    active: z.boolean().default(true),
    position: zs.int().default(0),
    isNew: z.boolean().default(false),
  }),
  async ({ isNew, ...input }, user) => {
    const t = db.from(tbl(schema.campaignSources));
    if (isNew) {
      if (await maybe(t.select("key").eq("key", input.key))) throw new UserError("That source already exists.", { key: "Already used." });
      await exec(db.from(tbl(schema.campaignSources)).insert(vals(schema.campaignSources, input)));
    } else await exec(t.update({ name: input.name, active: input.active, position: input.position }).eq("key", input.key));
    await audit(user, "settings", "lead_source", input.key, `${isNew ? "Added" : "Updated"} lead source ${input.name}`);
  },
);

export const saveExpenseCategory = adminAction("settings.manage", z.object({ id: zs.optUuid(), name: zs.required("Name", 60) }), async ({ id, name }, user) => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (id) await exec(db.from(tbl(schema.expenseCategories)).update({ name }).eq("id", id));
  else {
    const all = await many<{ position: number }>(db.from(tbl(schema.expenseCategories)).select("position").order("position", { ascending: false }).limit(1));
    await exec(db.from(tbl(schema.expenseCategories)).insert({ name, slug, position: (all[0]?.position ?? 0) + 1 }));
  }
  await audit(user, "settings", "expense_category", id ?? null, `${id ? "Renamed" : "Added"} expense category ${name}`);
});

export const saveChecklist = adminAction(
  "settings.manage",
  z.object({ id: zs.optUuid(), name: zs.required("Name", 80), phase: z.enum(["PRE", "POST"]), items: lines(60) }),
  async ({ id, ...input }, user) => {
    if (!input.items.length) throw new UserError("Add at least one item.", { items: "Required." });
    const t = db.from(tbl(schema.checklistTemplates));
    if (id) await exec(t.update(vals(schema.checklistTemplates, input)).eq("id", id));
    else await exec(t.insert(vals(schema.checklistTemplates, input)));
    await audit(user, "settings", "checklist", id ?? null, `${id ? "Updated" : "Added"} checklist ${input.name}`);
  },
);

export const deleteChecklist = adminAction("settings.manage", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  await exec(db.from(tbl(schema.checklistTemplates)).delete().eq("id", id));
  await audit(user, "settings", "checklist", id, "Deleted a checklist");
});

export const saveStageName = adminAction("settings.manage", z.object({ key: z.string().min(1).max(30), name: zs.required("Name", 40) }), async ({ key, name }, user) => {
  await exec(db.from(tbl(schema.salesPipelineStages)).update({ name }).eq("key", key));
  await audit(user, "settings", "pipeline_stage", key, `Renamed pipeline stage to ${name}`);
});
