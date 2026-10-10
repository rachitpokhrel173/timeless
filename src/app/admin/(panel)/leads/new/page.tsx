import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/admin/ui";
import LeadForm from "../LeadForm";
import { leadFormOptions } from "../options";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const user = await requirePage("leads.create");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New lead" description="For enquiries by phone, walk-in or social media. Website inquiries are added automatically." back={{ href: "/admin/leads", label: "Leads" }} />
      <Card>
        <LeadForm values={{ assignedTo: user.id }} opts={await leadFormOptions()} />
      </Card>
    </div>
  );
}
