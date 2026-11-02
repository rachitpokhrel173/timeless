import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/session";

/*
 * The Pipeline board is retired from the admin UI (Phase 1): leads are managed from Leads,
 * Inquiries, Customers, Quotations and Bookings. Lead stages, their history and the
 * sales_pipeline_stages table are unchanged — stages are still each lead's status.
 * Old bookmarks land on the Leads list. PipelineBoard.tsx is kept, unused, for reference.
 */
export default async function PipelinePage() {
  await requirePage("leads.view");
  redirect("/admin/leads");
}
