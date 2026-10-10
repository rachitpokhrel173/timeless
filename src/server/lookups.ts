import "server-only";
import { adminDb, many, schema, tbl } from "@/db";

/** Option lists for admin selects (read after the page's permission check). */

type Option = { value: string; label: string };

export const eventTypeOptions = () => many<Option>(adminDb.from(tbl(schema.eventTypes)).select("value:slug,label:name").order("position"));

/** Staff users who can sign in (for "assigned to"). */
export const userOptions = async () => {
  const rows = await many<Option>(adminDb.from(tbl(schema.profiles)).select("value:id,label:full_name,user_roles!inner(user_id)").eq("active", true).order("full_name"));
  return rows.map(({ value, label }) => ({ value, label }));
};

export const staffOptions = () => many<Option>(adminDb.from(tbl(schema.staff)).select("value:id,label:name").eq("active", true).is("archived_at", null).order("name"));

export const customerOptions = () =>
  many<Option & { phone: string | null }>(adminDb.from(tbl(schema.customers)).select("value:id,label:name,phone").is("deleted_at", null).is("archived_at", null).order("name"));

export const campaignOptions = () => many<Option>(adminDb.from(tbl(schema.campaigns)).select("value:id,label:name").is("archived_at", null).order("name"));

export const sourceOptions = () => many<Option>(adminDb.from(tbl(schema.campaignSources)).select("value:key,label:name").eq("active", true).order("position"));

export const stageOptions = () => many<Option>(adminDb.from(tbl(schema.salesPipelineStages)).select("value:key,label:name").order("position"));

export const packageOptions = () =>
  many<Option & { price: number }>(adminDb.from(tbl(schema.packages)).select("value:id,label:name,price").neq("status", "ARCHIVED").order("position"));

export const vendorOptions = () => many<Option>(adminDb.from(tbl(schema.vendors)).select("value:id,label:name").eq("active", true).is("archived_at", null).order("name"));

export const inventoryCategoryOptions = () => many<Option>(adminDb.from(tbl(schema.inventoryCategories)).select("value:id,label:name").order("position"));

export const expenseCategoryOptions = () => many<Option>(adminDb.from(tbl(schema.expenseCategories)).select("value:id,label:name").order("position"));

export const eventTypeName = (options: { value: string; label: string }[], slug?: string | null) =>
  options.find((o) => o.value === slug)?.label ?? (slug ? slug.replace(/-/g, " ") : "—");

/** Website images for pickers (public media + images shipped with the site). */
export const mediaOptions = () =>
  many<{ id: string; url: string | null; alt: string; title: string | null; folder: string }>(
    adminDb.from(tbl(schema.media)).select("id,url,alt,title,folder").in("bucket", ["public-media", "static"]).is("deleted_at", null).like("mime", "image/%").order("created_at", { ascending: false }).limit(500),
  );

export const inventoryItemOptions = () => many<Option>(adminDb.from(tbl(schema.inventoryItems)).select("value:id,label:name").is("archived_at", null).order("name"));
