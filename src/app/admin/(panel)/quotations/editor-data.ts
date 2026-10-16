import "server-only";
import { adminDb, all, maybe, schema, tbl } from "@/db";
import { DEFAULT_QUOTE_TERMS } from "@/lib/defaults";
import { customerOptions, eventTypeOptions } from "@/server/lookups";
import { listQuoteTemplates } from "@/server/quote-templates";

export type QuoteSettings = { terms?: string; termsVersion?: string; taxRate?: number; depositAmount?: number; validityDays?: number };

export async function quoteSettings(): Promise<Required<QuoteSettings>> {
  const row = await maybe<{ value: QuoteSettings }>(adminDb.from(tbl(schema.siteSettings)).select("value").eq("key", "quotation_settings"));
  const v = row?.value ?? {};
  return { terms: v.terms ?? DEFAULT_QUOTE_TERMS, termsVersion: v.termsVersion ?? "", taxRate: v.taxRate ?? 0, depositAmount: v.depositAmount ?? 0, validityDays: v.validityDays ?? 14 };
}

/** Everything the quotation editor's pickers need (read after the page's permission check). */
export async function editorOptions() {
  const [customers, eventTypes, packages, stock, templates] = await Promise.all([
    customerOptions(),
    eventTypeOptions(),
    all<{ id: string; name: string; price: number; items: { label: string; quantity: number; inventoryItemId: string | null; position: number }[] }>(() =>
      adminDb
        .from(tbl(schema.packages))
        .select("id,name,price,items:package_items(label,quantity,inventoryItemId:inventory_item_id,position)")
        .neq("status", "ARCHIVED")
        .order("position")
        .order("id"),
    ),
    all<{ id: string; name: string; sku: string; rentalPrice: number; unit: string }>(() =>
      adminDb.from(tbl(schema.inventoryItems)).select("id,name,sku,rentalPrice:rental_price,unit").is("archived_at", null).order("name").order("id"),
    ),
    listQuoteTemplates(),
  ]);
  return {
    customers: customers.map((c) => ({ value: c.value, label: c.phone ? `${c.label} · ${c.phone}` : c.label })),
    eventTypes,
    packages: packages.map((p) => ({
      value: p.id,
      label: p.name,
      price: p.price,
      lines: [...p.items].sort((a, b) => a.position - b.position).map(({ label, quantity, inventoryItemId }) => ({ label, quantity, inventoryItemId })),
    })),
    stock: stock.map((s) => ({ value: s.id, label: `${s.name} (${s.sku})`, price: s.rentalPrice, unit: s.unit })),
    templates: templates.map(({ id, name, ...t }) => ({ ...t, value: id, label: name })),
  };
}
