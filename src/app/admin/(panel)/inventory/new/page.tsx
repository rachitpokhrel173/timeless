import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/session";
import { inventoryCategoryOptions, vendorOptions } from "@/server/lookups";
import { Card, PageHeader } from "@/components/admin/ui";
import { ItemForm } from "../InventoryClient";

export const metadata: Metadata = { title: "Add inventory item" };

export default async function NewItemPage() {
  await requirePage("inventory.create");
  const [categories, vendors] = await Promise.all([inventoryCategoryOptions(), vendorOptions()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add inventory item" back={{ href: "/admin/inventory", label: "Inventory" }} />
      <Card>
        <ItemForm categories={categories} vendors={vendors} />
      </Card>
    </div>
  );
}
