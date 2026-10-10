import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/session";
import { isUuid, listParams } from "@/lib/list";
import { customerOptions, eventTypeOptions, packageOptions } from "@/server/lookups";
import { Card, PageHeader } from "@/components/admin/ui";
import BookingForm from "../BookingForm";

export const metadata: Metadata = { title: "New booking" };

export default async function NewBookingPage({ searchParams }: PageProps<"/admin/bookings/new">) {
  await requirePage("bookings.create");
  const { str } = listParams(await searchParams);
  const [customers, packages, eventTypes] = await Promise.all([customerOptions(), packageOptions(), eventTypeOptions()]);
  const customer = str("customer");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New booking" back={{ href: "/admin/bookings", label: "Bookings" }} />
      <Card>
        <BookingForm
          customers={customers.map((c) => ({ value: c.value, label: c.phone ? `${c.label} · ${c.phone}` : c.label }))}
          packages={packages}
          eventTypes={eventTypes}
          defaultCustomer={isUuid(customer) ? customer : undefined}
        />
      </Card>
    </div>
  );
}
