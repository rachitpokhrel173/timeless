import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { inventoryWithStock } from "@/server/inventory";
import { inventoryCategoryOptions, vendorOptions } from "@/server/lookups";
import { ArchivedBadge, label } from "@/components/admin/status";
import { Badge, Card, DetailList, EmptyState, Notice, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { ArchiveItemButton, EditItemButton, StockButton } from "../InventoryClient";

export const metadata: Metadata = { title: "Inventory item" };

const IN = new Set(["STOCK_IN", "RETURN", "RELEASE", "REPAIRED", "MAINTENANCE_OUT"]);

export default async function InventoryItemPage({ params }: PageProps<"/admin/inventory/[id]">) {
  const user = await requirePage("inventory.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const item = await maybe<Row<typeof schema.inventoryItems> & { cat: { name: string } | null; supplier: { id: string; name: string } | null }>(
    adminDb.from(tbl(schema.inventoryItems)).select(`${cols(schema.inventoryItems)},cat:inventory_categories(name),supplier:vendors(id,name)`).eq("id", id),
  );
  if (!item) notFound();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const [stock, movements, reservations, packages, categories, vendors] = await Promise.all([
    item.archivedAt ? [] : inventoryWithStock([id]),
    many<Row<typeof schema.inventoryMovements> & { p: { fullName: string } | null; e: { id: string; title: string } | null }>(
      adminDb.from(tbl(schema.inventoryMovements)).select(`${cols(schema.inventoryMovements)},p:profiles(fullName:full_name),e:events(id,title)`).eq("item_id", id).order("created_at", { ascending: false }).limit(60),
    ),
    many<{ id: string; quantity: number; status: string; r: { e: { id: string; title: string; eventDate: string; status: string } } }>(
      adminDb
        .from(tbl(schema.inventoryReservationItems))
        .select("id,quantity,status,r:inventory_reservations!inner(e:events!inner(id,title,eventDate:event_date,status))")
        .eq("item_id", id)
        .in("status", ["RESERVED", "CHECKED_OUT"])
        .order("created_at"),
    ),
    many<{ quantity: number; pkg: { id: string; name: string } }>(adminDb.from(tbl(schema.packageItems)).select("quantity,pkg:packages!inner(id,name)").eq("inventory_item_id", id)),
    inventoryCategoryOptions(),
    vendorOptions(),
  ]);
  const s = stock[0];
  const upcoming = reservations.filter((r) => r.r.e.status !== "CANCELLED").sort((a, b) => a.r.e.eventDate.localeCompare(b.r.e.eventDate));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/inventory", label: "Inventory" }}
        eyebrow={`${item.sku}${item.cat ? ` · ${item.cat.name}` : ""}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {item.name}
            {item.archivedAt && <ArchivedBadge />}
            {s?.low && <Badge tone="warning">Low stock</Badge>}
            {item.consumable && <Badge icon={false}>Consumable</Badge>}
          </span>
        }
        actions={
          <>
            {can("inventory.update") && <ArchiveItemButton id={id} archived={!!item.archivedAt} />}
            {can("inventory.update") && <EditItemButton values={item} categories={categories} vendors={vendors} />}
            {can("inventory.adjust") && !item.archivedAt && <StockButton id={id} unit={item.unit} />}
          </>
        }
      />
      {s && s.available < 0 && (
        <div className="mb-4">
          <Notice tone="danger" title="Over-reserved">
            Events hold {s.reserved} {item.unit} but only {s.usable} are usable. Release or re-plan a reservation.
          </Notice>
        </div>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Total owned", item.quantity],
          ["Reserved", s?.reserved ?? 0],
          ["Damaged", item.damaged],
          ["In maintenance", item.inMaintenance],
          ["Available", s?.available ?? 0],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-a-border bg-a-surface p-4">
            <p className="text-[13px] text-a-muted">{l}</p>
            <p className={`mt-1 font-serif text-2xl font-medium tabular-nums ${l === "Available" && Number(v) <= 0 ? "text-a-danger" : ""}`}>
              {v} <span className="font-sans text-xs text-a-muted">{item.unit}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="Reserved for events" bodyClassName="p-0">
            {upcoming.length === 0 ? (
              <EmptyState compact title="Not reserved for any upcoming event" />
            ) : (
              <ul className="divide-y divide-a-border">
                {upcoming.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <Link href={`/admin/events/${r.r.e.id}?tab=inventory`} className="hover:underline">
                      <span className="font-medium">{r.r.e.title}</span>
                      <span className="block text-xs text-a-muted">{fmtDate(r.r.e.eventDate)}</span>
                    </Link>
                    <span className="flex items-center gap-2 text-[13px]">
                      <Badge tone={r.status === "CHECKED_OUT" ? "info" : "accent"}>{label(r.status)}</Badge>
                      <span className="tabular-nums">
                        {r.quantity} {item.unit}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Stock history" bodyClassName="p-0">
            {movements.length === 0 ? (
              <EmptyState compact title="No movements yet" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Movement</Th>
                    <Th className="text-right">Qty</Th>
                    <Th>Event / reference</Th>
                    <Th>By</Th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <Td className="text-xs whitespace-nowrap">{fmtDateTime(m.createdAt)}</Td>
                      <Td>
                        {label(m.type)}
                        {m.notes && <span className="block text-xs text-a-muted">{m.notes}</span>}
                      </Td>
                      <Td className={`text-right tabular-nums ${IN.has(m.type) || (m.type === "ADJUSTMENT" && m.quantity > 0) ? "text-a-success" : ""}`}>
                        {m.type === "ADJUSTMENT" ? (m.quantity > 0 ? `+${m.quantity}` : m.quantity) : m.quantity}
                      </Td>
                      <Td className="text-xs">{m.e ? <Link href={`/admin/events/${m.e.id}?tab=inventory`} className="hover:underline">{m.e.title}</Link> : (m.reference ?? "—")}</Td>
                      <Td className="text-xs">{m.p?.fullName ?? "System"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Details">
            <DetailList
              columns={1}
              items={[
                ["Unit", item.unit],
                ["Low-stock alert", item.lowStockThreshold ? `below ${item.lowStockThreshold}` : "Off"],
                ["Location", item.location],
                ["Supplier", item.supplier ? <Link href={`/admin/vendors/${item.supplier.id}`} className="hover:underline">{item.supplier.name}</Link> : null],
                ["Rental price", npr(item.rentalPrice)],
                ...(can("expenses.view")
                  ? ([
                      ["Purchase cost", npr(item.purchaseCost)],
                      ["Replacement cost", npr(item.replacementCost)],
                    ] as [string, string][])
                  : []),
                ["Description", item.description],
              ]}
            />
          </Card>
          {packages.length > 0 && (
            <Card title="Used in packages">
              <ul className="space-y-1.5 text-[13px]">
                {packages.map((p) => (
                  <li key={p.pkg.id} className="flex justify-between">
                    <Link href={`/admin/packages/${p.pkg.id}`} className="hover:underline">
                      {p.pkg.name}
                    </Link>
                    <span className="tabular-nums">× {p.quantity}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
