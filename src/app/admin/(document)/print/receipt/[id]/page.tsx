import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { isUuid } from "@/lib/list";
import { receiptDoc } from "@/server/documents";
import { BusinessDocument } from "@/components/documents/BusinessDocument";
import PrintButton from "@/components/documents/PrintButton";

export const metadata: Metadata = { title: "Receipt PDF" };

/** Printable payment receipt — "Print → Save as PDF". None for reversed or fully refunded payments. */
export default async function PrintReceiptPage({ params }: PageProps<"/admin/print/receipt/[id]">) {
  await requirePage("payments.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const doc = await receiptDoc(id);
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
