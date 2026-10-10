import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { adminDb, all, schema, tbl } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { npr } from "@/lib/format";
import { eventTypeOptions, mediaOptions } from "@/server/lookups";
import { CONTENT_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { NewPackageButton } from "./PackageClient";

export const metadata: Metadata = { title: "Packages" };

export default async function PackagesPage() {
  const user = await requirePage();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  if (!can("cms.view") && !can("inventory.view")) await requirePage("cms.view");
  const manage = can("cms.manage") || can("inventory.update");
  const [packages, bookings, media, eventTypes] = await Promise.all([
    all<{ id: string; name: string; tier: string | null; summary: string | null; price: number; priceFrom: boolean; status: string; featured: boolean; image: { url: string | null } | null; items: { inventoryItemId: string | null }[] }>(() =>
      adminDb
        .from(tbl(schema.packages))
        .select("id,name,tier,summary,price,priceFrom:price_from,status,featured,image:media!image_id(url),items:package_items(inventoryItemId:inventory_item_id)")
        .order("position")
        .order("id"),
    ),
    all<{ packageId: string }>(() => adminDb.from(tbl(schema.bookings)).select("packageId:package_id").not("package_id", "is", null).neq("status", "CANCELLED").order("id")),
    manage ? mediaOptions() : [],
    eventTypeOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Packages"
        description="Your Essential, Signature and Bespoke offers. Each package lists what's included; items linked to inventory are reserved when it's booked."
        actions={manage && <NewPackageButton media={media} eventTypes={eventTypes} />}
      />
      {packages.length === 0 ? (
        <Card>
          <EmptyState icon={Package} title="No packages yet" />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {packages.map((p) => (
            <Link key={p.id} href={`/admin/packages/${p.id}`} className="group overflow-hidden rounded-xl border border-a-border bg-a-surface hover:border-a-strong">
              <div className="aspect-[16/9] bg-a-subtle">
                {p.image?.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                  <img src={p.image.url} alt="" className="size-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-serif text-xl font-medium group-hover:underline">{p.name}</h2>
                  <StatusBadge map={CONTENT_STATUS} value={p.status} />
                </div>
                <p className="mt-0.5 text-[13px] text-a-muted">{p.summary ?? "—"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-semibold">{p.price ? `${p.priceFrom ? "From " : ""}${npr(p.price)}` : "Price not set"}</span>
                  {p.featured && <Badge tone="gold">Homepage</Badge>}
                  <Badge icon={false}>{p.items.length} item{p.items.length === 1 ? "" : "s"}</Badge>
                  <Badge icon={false}>{bookings.filter((b) => b.packageId === p.id).length} booked</Badge>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
