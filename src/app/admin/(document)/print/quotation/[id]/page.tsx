import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { getSiteSettings } from "@/lib/content";
import { isUuid } from "@/lib/list";
import { quoteDocProps, quoteImages } from "@/server/documents";
import { BusinessDocument } from "@/components/documents/BusinessDocument";
import PrintButton from "@/components/documents/PrintButton";

export const metadata: Metadata = { title: "Quotation PDF" };

export default async function PrintQuotationPage({ params }: PageProps<"/admin/print/quotation/[id]">) {
  await requirePage("quotations.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const quote = await maybe<Row<typeof schema.quotations> & { customer: { name: string; phone: string | null; email: string | null } }>(
    adminDb.from(tbl(schema.quotations)).select(`${cols(schema.quotations)},customer:customers!inner(name,phone,email)`).eq("id", id).is("deleted_at", null),
  );
  if (!quote) notFound();
  const [items, brand, images] = await Promise.all([
    many<Row<typeof schema.quotationItems>>(adminDb.from(tbl(schema.quotationItems)).select(cols(schema.quotationItems)).eq("quotation_id", id).order("position")),
    getSiteSettings(),
    quoteImages(quote.referenceMediaIds),
  ]);
  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[820px] justify-end px-4 print:hidden">
        <PrintButton />
      </div>
      <BusinessDocument {...quoteDocProps(brand, quote, quote.customer, items)} images={images} />
    </>
  );
}
