import type { Metadata } from "next";
import Link from "next/link";
import { Images } from "lucide-react";
import { adminDb, all, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate } from "@/lib/format";
import { isUuid, listParams } from "@/lib/list";
import { eventTypeOptions, mediaOptions } from "@/server/lookups";
import { FilterSelect } from "@/components/admin/interactive";
import { CONTENT_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, Card, EmptyState, PageHeader, Toolbar } from "@/components/admin/ui";
import { AlbumButton, AlbumForm } from "./GalleryClient";

export const metadata: Metadata = { title: "Gallery" };

export default async function GalleryPage({ searchParams }: PageProps<"/admin/website/gallery">) {
  const user = await requirePage();
  if (!user.permissions.has("cms.view") && !user.permissions.has("cms.manage")) await requirePage("cms.view");
  const manage = user.permissions.has("cms.manage");
  const { str } = listParams(await searchParams);
  const fromEvent = isUuid(str("fromEvent")) ? str("fromEvent")! : null;

  const [albums, counts, media, eventTypes, events, source] = await Promise.all([
    all<Row<typeof schema.galleryAlbums> & { cover: { url: string | null } | null }>(() => {
      let q = adminDb.from(tbl(schema.galleryAlbums)).select(`${cols(schema.galleryAlbums)},cover:media!cover_id(url)`);
      if (str("category")) q = q.eq("category", str("category")!);
      if (str("status")) q = q.eq("status", str("status")!);
      return q.order("position").order("id");
    }),
    all<{ albumId: string }>(() => adminDb.from(tbl(schema.galleryItems)).select("albumId:album_id").order("id")),
    manage ? mediaOptions() : [],
    eventTypeOptions(),
    manage ? many<{ value: string; label: string }>(adminDb.from(tbl(schema.events)).select("value:id,label:title").order("event_date", { ascending: false }).limit(150)) : [],
    fromEvent ? maybe<{ id: string; title: string; eventType: string | null; eventDate: string; venue: string | null }>(adminDb.from(tbl(schema.events)).select("id,title,eventType:event_type,eventDate:event_date,venue").eq("id", fromEvent)) : null,
  ]);
  const opts = { media, eventTypes, events };

  return (
    <>
      <PageHeader title="Gallery" description="Albums of your work for the Gallery page and the homepage's featured work." actions={manage && !source && <AlbumButton {...opts} />} />
      {source && manage && (
        <Card title={`New album from “${source.title}”`} description="Create the album, then upload the event photos to it." className="mb-5">
          <AlbumForm
            {...opts}
            values={{
              title: source.title,
              eventId: source.id,
              eventType: source.eventType,
              eventDate: source.eventDate,
              location: source.venue,
              category: source.eventType?.includes("wedding") ? "weddings" : source.eventType?.includes("engagement") ? "engagements" : source.eventType?.includes("birthday") ? "birthdays" : /pasni|rice|gunyo/i.test(source.eventType ?? "") ? "pasni" : "corporate",
            }}
          />
        </Card>
      )}
      <Card bodyClassName="p-0">
        <Toolbar>
          <FilterSelect
            param="category"
            label="Category"
            options={[
              { value: "weddings", label: "Wedding & Reception" },
              { value: "engagements", label: "Engagement" },
              { value: "pasni", label: "Rice Weaning & Gunyo Cholo" },
              { value: "birthdays", label: "Birthday" },
              { value: "corporate", label: "Corporate & others" },
            ]}
          />
          <FilterSelect
            param="status"
            label="Status"
            options={[
              { value: "PUBLISHED", label: "Published" },
              { value: "DRAFT", label: "Draft" },
              { value: "ARCHIVED", label: "Archived" },
            ]}
          />
        </Toolbar>
        {albums.length === 0 ? (
          <EmptyState icon={Images} title="No albums yet">
            Create an album for each event you want to show off.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {albums.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/website/gallery/${a.id}`} className="group block overflow-hidden rounded-xl border border-a-border hover:border-a-strong">
                  <div className="aspect-[4/3] bg-a-subtle">
                    {a.cover?.url && (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                      <img src={a.cover.url} alt="" loading="lazy" className="size-full object-cover" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-medium group-hover:underline">{a.title}</p>
                    <p className="text-xs text-a-muted">
                      {a.category} · {counts.filter((c) => c.albumId === a.id).length} photos{a.eventDate ? ` · ${fmtDate(a.eventDate)}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <StatusBadge map={CONTENT_STATUS} value={a.status} />
                      {a.featured && <Badge tone="gold">Homepage</Badge>}
                      {a.placeholder && <Badge tone="warning">Sample</Badge>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
