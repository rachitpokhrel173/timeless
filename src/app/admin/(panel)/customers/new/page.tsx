import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/session";
import { sourceOptions } from "@/server/lookups";
import { Card, PageHeader } from "@/components/admin/ui";
import CustomerForm from "../CustomerForm";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requirePage("customers.create");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New customer" back={{ href: "/admin/customers", label: "Customers" }} />
      <Card>
        <CustomerForm sources={await sourceOptions()} />
      </Card>
    </div>
  );
}
