import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Images } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { eventTypeOptions, mediaOptions } from "@/server/lookups";
import UploadButton from "@/components/admin/Upload";
import { CONTENT_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, Card, EmptyState, Notice, PageHeader } from "@/components/admin/ui";
import { uploadMedia } from "../../../upload-actions";
import { AlbumButton, PhotoControls } from "../GalleryClient";

export const metadata: Metadata = { title: "Gallery album" };

export default async function AlbumPage({ params }: PageProps<"/admin/website/gallery/[id]">) {
  const user = await requirePage();
  if (!user.permissions.has("cms.view") && !user.permissions.has("cms.manage")) await requirePage("cms.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const album = await maybe<Row<typeof schema.galleryAlbums> & { ev: { id: string; title: string } | null }>(adminDb.from(tbl(schema.galleryAlbums)).select(`${cols(schema.galleryAlbums)},ev:events(id,title)`).eq("id", id));
  if (!album) notFound();
  const manage = user.permissions.has("cms.manage");
  const [items, media, eventTypes, events] = await Promise.all([
    many<Row<typeof schema.galleryItems> & { m: { url: string | null; alt: string } }>(adminDb.from(tbl(schema.galleryItems)).select(`${cols(schema.galleryItems)},m:media!inner(url,alt)`).eq("album_id", id).order("position").order("created_at")),
    manage ? mediaOptions() : [],
    eventTypeOptions(),
    manage ? many<{ value: string; label: string }>(adminDb.from(tbl(schema.events)).select("value:id,label:title").order("event_date", { ascending: false }).limit(150)) : [],
  ]);
  const missingAlt = items.filter((i) => !i.m.alt).length;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/website/gallery", label: "Gallery" }}
        eyebrow={`${album.category}${album.eventDate ? ` · ${fmtDate(album.eventDate)}` : ""}${album.location ? ` · ${album.location}` : ""}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {album.title}
            <StatusBadge map={CONTENT_STATUS} value={album.status} />
            {album.featured && <Badge tone="gold">Homepage</Badge>}
          </span>
        }
        description={album.ev ? <Link href={`/admin/events/${album.ev.id}`} className="hover:underline">From event: {album.ev.title}</Link> : album.description}
        actions={
          manage && (
            <>
              <UploadButton action={uploadMedia} fields={{ albumId: id, folder: "Gallery" }} label="Upload photos" accept="image/jpeg,image/png,image/webp,image/avif" variant="primary" success="Photos added to the album" />
              <AlbumButton values={album} media={media} eventTypes={eventTypes} events={events} />
            </>
          )
        }
      />
      {missingAlt > 0 && manage && (
        <div className="mb-4">
          <Notice tone="warning" title={`${missingAlt} photo${missingAlt === 1 ? " has" : "s have"} no description`}>
            Add alt text in the media library — it helps Google and visitors using screen readers.
          </Notice>
        </div>
      )}
      <Card bodyClassName="p-0">
        {items.length === 0 ? (
          <EmptyState icon={Images} title="No photos yet">
            Upload photos — they&rsquo;re resized and optimised automatically.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((it, i) => (
              <li key={it.id} className="overflow-hidden rounded-lg border border-a-border">
                <div className="relative aspect-[4/3] bg-a-subtle">
                  {it.m.url && (
                    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                    <img src={it.m.url} alt={it.m.alt} loading="lazy" className={`size-full object-cover ${it.status !== "PUBLISHED" ? "opacity-50" : ""}`} />
                  )}
                  <div className="absolute top-1.5 left-1.5 flex gap-1">
                    {album.coverId === it.mediaId && <Badge tone="gold">Cover</Badge>}
                    {it.status !== "PUBLISHED" && <Badge>Hidden</Badge>}
                  </div>
                </div>
                <div className="p-2">
                  <p className="truncate text-xs">{it.title || it.m.alt || "Untitled"}</p>
                  {manage && <PhotoControls id={it.id} albumId={id} mediaId={it.mediaId} isCover={album.coverId === it.mediaId} first={i === 0} last={i === items.length - 1} values={it} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
