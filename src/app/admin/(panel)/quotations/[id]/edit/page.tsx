import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { isUuid } from "@/lib/list";
import { Card, LinkButton, Notice, PageHeader } from "@/components/admin/ui";
import { quoteImages } from "@/server/documents";
import QuoteEditor from "../../QuoteEditor";
import ReferenceImages from "../../ReferenceImages";
import { editorOptions } from "../../editor-data";

export const metadata: Metadata = { title: "Edit quotation" };

export default async function EditQuotationPage({ params }: PageProps<"/admin/quotations/[id]/edit">) {
  await requirePage("quotations.update");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const quote = await maybe<Row<typeof schema.quotations> & { coupon: { code: string } | null }>(
    adminDb.from(tbl(schema.quotations)).select(`${cols(schema.quotations)},coupon:coupons(code)`).eq("id", id).is("deleted_at", null),
  );
  if (!quote) notFound();
  const back = { href: `/admin/quotations/${id}`, label: quote.number };
  if (!["DRAFT", "SENT", "VIEWED"].includes(quote.status)) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={`Edit ${quote.number}`} back={back} />
        <Notice tone="warning" title="This quotation can't be edited">
          It has been {quote.status.toLowerCase()}. Duplicate it to make a revised quote.
        </Notice>
        <div className="mt-4">
          <LinkButton href={back.href}>Back to quotation</LinkButton>
        </div>
      </div>
    );
  }
  const [items, options, images] = await Promise.all([
    many<Row<typeof schema.quotationItems>>(adminDb.from(tbl(schema.quotationItems)).select(cols(schema.quotationItems)).eq("quotation_id", id).order("position")),
    editorOptions(),
    quoteImages(quote.referenceMediaIds),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`Edit ${quote.number}`}
        description={quote.sentAt ? `Already sent — saving creates version ${quote.version + 1}, and the client's link shows the new version.` : "Draft — the client hasn't seen it yet."}
        back={back}
      />
      <Card>
        <QuoteEditor
          {...options}
          values={{
            id: quote.id,
            customerId: quote.customerId,
            leadId: quote.leadId,
            inquiryId: quote.inquiryId,
            packageId: quote.packageId,
            couponCode: quote.coupon?.code ?? null,
            title: quote.title,
            eventType: quote.eventType,
            eventDate: quote.eventDate,
            venue: quote.venue,
            guestCount: quote.guestCount,
            validUntil: quote.validUntil,
            discountType: quote.discountType,
            discountValue: quote.discountValue,
            taxRate: quote.taxRate,
            depositPercent: quote.depositPercent,
            notes: quote.notes,
            terms: quote.terms,
            termsVersion: quote.termsVersion,
            items: items.map((l) => ({ description: l.description, details: l.details, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, inventoryItemId: l.inventoryItemId })),
          }}
        />
      </Card>
      <Card className="mt-4">
        <ReferenceImages quotationId={quote.id} images={images} canEdit />
      </Card>
    </div>
  );
}
