import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { npr } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { inventoryWithStock } from "@/server/inventory";
import { eventTypeName, eventTypeOptions, inventoryItemOptions, mediaOptions } from "@/server/lookups";
import { CONTENT_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, Card, DetailList, EmptyState, Notice, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { DeletePackageItemButton, EditPackageButton, PackageItemButton } from "../PackageClient";

export const metadata: Metadata = { title: "Package" };

export default async function PackagePage({ params }: PageProps<"/admin/packages/[id]">) {
  const user = await requirePage();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  if (!can("cms.view") && !can("inventory.view")) await requirePage("cms.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const pkg = await maybe<Row<typeof schema.packages> & { image: { url: string | null } | null }>(adminDb.from(tbl(schema.packages)).select(`${cols(schema.packages)},image:media!image_id(url)`).eq("id", id));
  if (!pkg) notFound();
  const manage = can("cms.manage") || can("inventory.update");
  const [lines, eventTypes, media, itemOptions] = await Promise.all([
    many<Row<typeof schema.packageItems>>(adminDb.from(tbl(schema.packageItems)).select(cols(schema.packageItems)).eq("package_id", id).order("position")),
    eventTypeOptions(),
    manage ? mediaOptions() : [],
    manage ? inventoryItemOptions() : [],
  ]);
  const linked = lines.map((l) => l.inventoryItemId).filter((x): x is string => !!x);
  const stock = linked.length && can("inventory.view") ? await inventoryWithStock(linked) : [];
  const stockById = new Map(stock.map((s) => [s.id, s]));
  const short = lines.filter((l) => l.inventoryItemId && (stockById.get(l.inventoryItemId)?.usable ?? 0) < l.quantity);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/packages", label: "Packages" }}
        eyebrow={pkg.tier ?? "Package"}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {pkg.name}
            <StatusBadge map={CONTENT_STATUS} value={pkg.status} />
            {pkg.featured && <Badge tone="gold">Homepage</Badge>}
          </span>
        }
        description={pkg.summary}
        actions={manage && <EditPackageButton values={pkg} media={media} eventTypes={eventTypes} />}
      />
      {short.length > 0 && (
        <div className="mb-4">
          <Notice tone="warning" title="You don't own enough for one booking">
            {short.map((l) => l.label).join(", ")} — the package needs more than you have usable.
          </Notice>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card title="Package contents" description="Items linked to inventory are reserved automatically for the event date when this package is booked." bodyClassName="p-0" actions={manage && <PackageItemButton packageId={id} items={itemOptions} />}>
          {lines.length === 0 ? (
            <EmptyState compact title="Nothing listed yet">
              Add what the package includes — link décor you own so it's reserved with each booking.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Included</Th>
                  <Th className="text-right">Qty</Th>
                  <Th>Inventory</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const s = l.inventoryItemId ? stockById.get(l.inventoryItemId) : undefined;
                  return (
                    <tr key={l.id}>
                      <Td className="font-medium">{l.label}</Td>
                      <Td className="text-right tabular-nums">{l.quantity}</Td>
                      <Td className="text-xs">
                        {s ? (
                          <Link href={`/admin/inventory/${s.id}`} className="hover:underline">
                            {s.name} · <span className={s.usable < l.quantity ? "text-a-danger" : "text-a-muted"}>{s.usable} owned</span>
                          </Link>
                        ) : (
                          <span className="text-a-muted">Not tracked</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        {manage && (
                          <span className="inline-flex">
                            <PackageItemButton packageId={id} items={itemOptions} values={l} />
                            <DeletePackageItemButton id={l.id} label={l.label} />
                          </span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        <div className="space-y-4">
          {pkg.image?.url && (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview
            <img src={pkg.image.url} alt="" className="aspect-[16/10] w-full rounded-xl border border-a-border object-cover" />
          )}
          <Card title="Offer">
            <DetailList
              columns={1}
              items={[
                ["Price", pkg.price ? `${pkg.priceFrom ? "From " : ""}${npr(pkg.price)}` : "Not set"],
                ["Event type", pkg.eventType ? eventTypeName(eventTypes, pkg.eventType) : "Any"],
                ["Website", pkg.status === "PUBLISHED" ? (pkg.featured ? "Shown on the homepage" : "Published") : "Hidden"],
              ]}
            />
            {pkg.features.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 pl-4 text-[13px]">
                {pkg.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
