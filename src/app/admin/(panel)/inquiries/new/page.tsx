import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/session";
import { getInquiryOptions } from "@/lib/content";
import { eventTypeOptions, sourceOptions, userOptions } from "@/server/lookups";
import { Card, PageHeader } from "@/components/admin/ui";
import { NewInquiryForm } from "../InquiryClient";

export const metadata: Metadata = { title: "Record inquiry" };

export default async function NewInquiryPage() {
  const user = await requirePage("leads.create");
  const [eventTypes, sources, users, opts] = await Promise.all([eventTypeOptions(), sourceOptions(), userOptions(), getInquiryOptions()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Record an inquiry" description="For phone calls, walk-ins and social messages. A lead and customer record are created (or matched) automatically." back={{ href: "/admin/inquiries", label: "Inquiries" }} />
      <Card>
        <NewInquiryForm eventTypes={eventTypes} sources={sources} users={users} guestCounts={opts.guestCounts} budgets={opts.budgets} me={user.id} />
      </Card>
    </div>
  );
}
