import type { Metadata } from "next";
import { adminDb, cols, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { todayISO } from "@/lib/format";
import { isUuid, listParams } from "@/lib/list";
import { getQuoteTemplate } from "@/server/quote-templates";
import { Card, PageHeader } from "@/components/admin/ui";
import QuoteEditor, { type QuoteEditorValues, type QuoteLine } from "../QuoteEditor";
import { editorOptions, quoteSettings } from "../editor-data";

export const metadata: Metadata = { title: "New quotation" };

const guests = (v: string | null | undefined) => {
  const n = Number.parseInt((v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Starting lines from what the visitor picked on the inquiry form: catalogue designs keep their
 * listed price ("Entrance Décor: Golden Dome Tunnel (Rs 15,000 each)"); services have no price,
 * so they start at 0 for staff to fill in.
 */
function inquiryLines(designs: string[] | null, services: string[] | null): QuoteLine[] {
  const fromDesigns = (designs ?? []).map((d): QuoteLine => {
    const m = /^(.*?)\s*\(Rs\s*([\d,]+)\s*(.*?)\)\s*$/.exec(d);
    if (!m) return { description: d, quantity: 1, unit: "", unitPrice: 0 };
    const unit = m[3]!.replace(/\bonwards\b/, "").trim();
    return { description: m[1]!, quantity: 1, unit: unit === "each" ? "" : unit, unitPrice: Number(m[2]!.replace(/,/g, "")) };
  });
  const fromServices = (services ?? []).map((name): QuoteLine => ({ description: name, quantity: 1, unit: "", unitPrice: 0 }));
  return [...fromDesigns, ...fromServices];
}

/** Start a quotation, optionally prefilled from ?customer=, ?lead= or ?inquiry=. */
export default async function NewQuotationPage({ searchParams }: PageProps<"/admin/quotations/new">) {
  await requirePage("quotations.create");
  const { str } = listParams(await searchParams);
  const [options, settings] = await Promise.all([editorOptions(), quoteSettings()]);

  const values: QuoteEditorValues = {
    validUntil: todayISO(settings.validityDays),
    taxRate: settings.taxRate,
    depositAmount: settings.depositAmount,
    terms: settings.terms,
    termsVersion: settings.termsVersion,
  };
  let customerLabel: string | undefined;
  let source: string | undefined;

  const inquiryId = str("inquiry");
  const leadId = str("lead");
  const customerId = str("customer");
  if (isUuid(inquiryId)) {
    const iq = await maybe<Row<typeof schema.inquiries>>(adminDb.from(tbl(schema.inquiries)).select(cols(schema.inquiries)).eq("id", inquiryId));
    if (iq) {
      Object.assign(values, { inquiryId: iq.id, leadId: iq.leadId, customerId: iq.customerId, eventType: iq.eventType, eventDate: iq.eventDate, venue: iq.venue, guestCount: guests(iq.guestCount), packageId: iq.packageId, title: `${iq.name} — ${iq.eventType.replace(/-/g, " ")}`, couponCode: iq.utm?.offer ?? null, items: inquiryLines(iq.designs, iq.services) });
      if (!iq.customerId) customerLabel = `${iq.name} (from inquiry ${iq.number})`;
      source = `inquiry ${iq.number}`;
    }
  } else if (isUuid(leadId)) {
    const lead = await maybe<Row<typeof schema.leads>>(adminDb.from(tbl(schema.leads)).select(cols(schema.leads)).eq("id", leadId));
    if (lead) {
      Object.assign(values, { leadId: lead.id, customerId: lead.customerId, eventType: lead.eventType, eventDate: lead.eventDate, venue: lead.location, guestCount: guests(lead.guestCount), title: `${lead.name}${lead.eventType ? ` — ${lead.eventType.replace(/-/g, " ")}` : ""}` });
      if (!lead.customerId) customerLabel = `${lead.name} (from lead ${lead.number})`;
      source = `lead ${lead.number}`;
    }
  } else if (isUuid(customerId)) {
    values.customerId = customerId;
  }
  // ?template= adds a saved template's lines after anything prefilled above, with its pricing defaults
  const templateId = str("template");
  const template = isUuid(templateId) ? await getQuoteTemplate(templateId) : null;
  if (template) {
    Object.assign(values, {
      items: [...(values.items ?? []), ...template.items],
      eventType: values.eventType ?? template.eventType,
      discountType: template.discountType,
      discountValue: template.discountValue,
      taxRate: template.taxRate,
      depositAmount: template.depositAmount,
      notes: template.notes,
    });
    source = source ? `${source} and the “${template.name}” template` : `the “${template.name}” template`;
  }
  // A lead without a customer gets one on save; an inquiry without a lead can't — let staff pick.
  if (customerLabel && !values.leadId) customerLabel = undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New quotation" description={source ? `Prefilled from ${source}.` : "Build the quote line by line, or start from a template or package."} back={{ href: "/admin/quotations", label: "Quotations" }} />
      <Card>
        <QuoteEditor values={values} {...options} customerLabel={customerLabel} />
      </Card>
    </div>
  );
}
