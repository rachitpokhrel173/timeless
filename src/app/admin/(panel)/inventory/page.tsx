import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Boxes, Download, Plus } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { npr } from "@/lib/format";
import { listParams } from "@/lib/list";
import { inventoryWithStock } from "@/server/inventory";
import { inventoryCategoryOptions } from "@/server/lookups";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { Badge, buttonClass, Card, EmptyState, Kpi, LinkButton, PageHeader, Pagination, Table, Td, Th, Toolbar } from "@/components/admin/ui";
import { CategoryButton } from "./InventoryClient";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  const user = await requirePage("inventory.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 50);
  const [all, categories] = await Promise.all([inventoryWithStock(), inventoryCategoryOptions()]);

  let items = all;
  if (str("category")) items = items.filter((i) => i.categoryId === str("category"));
  if (str("stock") === "low") items = items.filter((i) => i.low);
  if (str("stock") === "out") items = items.filter((i) => i.available <= 0);
  if (str("stock") === "damaged") items = items.filter((i) => i.damaged > 0 || i.inMaintenance > 0);
  if (q) {
    const t = q.toLowerCase();
    items = items.filter((i) => `${i.name} ${i.sku} ${i.location ?? ""}`.toLowerCase().includes(t));
  }
  const pageItems = items.slice(offset, offset + pageSize);
  const low = all.filter((i) => i.low);
  const value = all.reduce((s, i) => s + i.quantity * (i.replacementCost || i.purchaseCost), 0);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Décor you own — what's on the shelf, reserved for events, damaged or in maintenance."
        actions={
          <>
            <a href="/api/admin/export/inventory" className={buttonClass("secondary")}>
              <Download className="size-4" aria-hidden /> Export CSV
            </a>
            {user.permissions.has("inventory.update") && <CategoryButton />}
            {user.permissions.has("inventory.create") && (
              <LinkButton href="/admin/inventory/new" variant="primary" icon={Plus}>
                Add item
              </LinkButton>
            )}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Items" value={all.length} />
        <Kpi label="Units reserved now" value={all.reduce((s, i) => s + i.reserved, 0)} />
        <Kpi label="Low stock" value={low.length} href="/admin/inventory?stock=low" icon={low.length ? AlertTriangle : undefined} />
        {user.permissions.has("expenses.view") && <Kpi label="Stock value" value={npr(value)} hint="at replacement cost" />}
      </div>
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Name, SKU or location" />
          <FilterSelect param="category" label="Category" options={categories} />
          <FilterSelect
            param="stock"
            label="Stock"
            allLabel="Everything"
            options={[
              { value: "low", label: "Low stock" },
              { value: "out", label: "None available" },
              { value: "damaged", label: "Damaged / maintenance" },
            ]}
          />
        </Toolbar>
        {pageItems.length === 0 ? (
          <EmptyState icon={Boxes} title={all.length ? "No items match" : "No inventory yet"} action={!all.length && user.permissions.has("inventory.create") ? <LinkButton href="/admin/inventory/new" size="sm">Add your first item</LinkButton> : undefined}>
            {all.length ? "Try a different filter." : "Add backdrops, arches, chairs, lights, candles and props to track and reserve them."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th className="text-right">Owned</Th>
                <Th className="text-right">Reserved</Th>
                <Th className="text-right">Damaged</Th>
                <Th className="text-right">Available</Th>
                <Th>Location</Th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((i) => (
                <tr key={i.id} className="hover:bg-a-subtle/60">
                  <Td>
                    <Link href={`/admin/inventory/${i.id}`} className="font-medium hover:underline">
                      {i.name}
                    </Link>
                    <span className="block text-xs text-a-muted">
                      {i.sku}
                      {i.consumable ? " · consumable" : ""}
                    </span>
                  </Td>
                  <Td>{i.category ?? "—"}</Td>
                  <Td className="text-right tabular-nums">
                    {i.quantity} <span className="text-a-muted">{i.unit}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{i.reserved || "—"}</Td>
                  <Td className="text-right tabular-nums">{i.damaged + i.inMaintenance || "—"}</Td>
                  <Td className="text-right">
                    <span className={`font-semibold tabular-nums ${i.available <= 0 ? "text-a-danger" : i.low ? "text-a-warning" : ""}`}>{i.available}</span>
                    {i.low && (
                      <Badge tone="warning" className="ml-1.5">
                        Low
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-xs">{i.location ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/inventory" params={sp} page={page} pageSize={pageSize} total={items.length} />
      </Card>
    </>
  );
}
