import "server-only";
import { adminDb, exec, maybe, schema, tbl } from "@/db";

/*
 * Reusable quotation templates (e.g. "Standard wedding", "Birthday — balloon package"): the line
 * items and pricing defaults of a quotation, saved under a name. Kept in site_settings, so they need
 * no table of their own; every read and write goes through the actions' permission checks.
 */

export type TemplateLine = { description: string; details?: string | null; quantity: number; unit?: string | null; unitPrice: number; inventoryItemId?: string | null };

export type QuoteTemplate = {
  id: string;
  name: string;
  description?: string | null;
  eventType?: string | null;
  items: TemplateLine[];
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  taxRate: number;
  depositAmount: number;
  notes?: string | null;
  updatedAt: string;
};

const KEY = "quotation_templates";

export async function listQuoteTemplates(): Promise<QuoteTemplate[]> {
  const row = await maybe<{ value: { templates?: QuoteTemplate[] } }>(adminDb.from(tbl(schema.siteSettings)).select("value").eq("key", KEY));
  return [...(row?.value.templates ?? [])].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getQuoteTemplate(id: string) {
  return (await listQuoteTemplates()).find((t) => t.id === id) ?? null;
}

export async function writeQuoteTemplates(templates: QuoteTemplate[], userId: string) {
  await exec(adminDb.from(tbl(schema.siteSettings)).upsert({ key: KEY, value: { templates }, is_public: false, updated_by: userId }, { onConflict: "key" }));
}
