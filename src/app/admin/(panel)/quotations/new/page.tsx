import type { Metadata } from "next";
import { adminDb, cols, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { todayISO } from "@/lib/format";
import { isUuid, listParams } from "@/lib/list";
import { Card, PageHeader } from "@/components/admin/ui";
import QuoteEditor, { type QuoteEditorValues } from "../QuoteEditor";
import { editorOptions, quoteSettings } from "../editor-data";

export const metadata: Metadata = { title: "New quotation" };

const guests = (v: string | null | undefined) => {
  const n = Number.parseInt((v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

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
      Object.assign(values, { inquiryId: iq.id, leadId: iq.leadId, customerId: iq.customerId, eventType: iq.eventType, eventDate: iq.eventDate, venue: iq.venue, guestCount: guests(iq.guestCount), packageId: iq.packageId, title: `${iq.name} — ${iq.eventType.replace(/-/g, " ")}`, couponCode: iq.utm?.offer ?? null });
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
  // A lead without a customer gets one on save; an inquiry without a lead can't — let staff pick.
  if (customerLabel && !values.leadId) customerLabel = undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New quotation" description={source ? `Prefilled from ${source}.` : "Build the quote line by line, or start from a package."} back={{ href: "/admin/quotations", label: "Quotations" }} />
      <Card>
        <QuoteEditor values={values} {...options} customerLabel={customerLabel} />
      </Card>
    </div>
  );
}
