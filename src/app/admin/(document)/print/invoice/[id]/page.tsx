import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { isUuid } from "@/lib/list";
import { invoiceDoc } from "@/server/documents";
import { BusinessDocument } from "@/components/documents/BusinessDocument";
import PrintButton from "@/components/documents/PrintButton";

export const metadata: Metadata = { title: "Invoice PDF" };

export default async function PrintInvoicePage({ params }: PageProps<"/admin/print/invoice/[id]">) {
  await requirePage("invoices.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const doc = await invoiceDoc(id);
  if (!doc) notFound();
  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[820px] justify-end px-4 print:hidden">
        <PrintButton />
      </div>
      <BusinessDocument {...doc} />
    </>
  );
}
