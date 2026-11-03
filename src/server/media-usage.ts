import "server-only";
import { adminDb, all, schema, tbl } from "@/db";

/*
 * Where each media library image is used. Reads with the service role because the answer must be
 * complete (drafts, hidden rows, staff photos) — callers check cms.view / cms.manage first.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

type Ref = { id: string | null; label: string };

export async function mediaUsage(): Promise<Map<string, string[]>> {
  const pick = <R,>(table: Parameters<typeof tbl>[0], select: string) => all<R>(() => adminDb.from(tbl(table)).select(select).order("id"));
  const [items, albums, services, packages, testimonials, catalogue, staff, eventTypes, inventory, seo, sections, settings, drafts] = await Promise.all([
    all<{ mediaId: string; album: { title: string } | null }>(() => adminDb.from(tbl(schema.galleryItems)).select("mediaId:media_id,album:gallery_albums(title)").order("id")),
    pick<{ title: string; coverId: string | null; beforeId: string | null; afterId: string | null }>(schema.galleryAlbums, "title,coverId:cover_id,beforeId:before_id,afterId:after_id"),
    pick<{ name: string; imageId: string | null; galleryIds: string[] }>(schema.services, "name,imageId:image_id,galleryIds:gallery_ids"),
    pick<{ name: string; imageId: string | null; galleryIds: string[] }>(schema.packages, "name,imageId:image_id,galleryIds:gallery_ids"),
    pick<{ customerName: string; photoId: string | null }>(schema.testimonials, "customerName:customer_name,photoId:photo_id"),
    pick<{ name: string; imageId: string | null }>(schema.catalogueItems, "name,imageId:image_id"),
    pick<{ photoId: string | null }>(schema.staff, "photoId:photo_id"),
    pick<{ name: string; imageId: string | null }>(schema.eventTypes, "name,imageId:image_id"),
    pick<{ name: string; imageId: string | null }>(schema.inventoryItems, "name,imageId:image_id"),
    all<{ path: string; ogImageId: string | null }>(() => adminDb.from(tbl(schema.seoSettings)).select("path,ogImageId:og_image_id").order("path")),
    all<{ key: string; content: unknown }>(() => adminDb.from(tbl(schema.homepageSections)).select("key,content").order("key")),
    all<{ key: string; value: unknown }>(() => adminDb.from(tbl(schema.siteSettings)).select("key,value").order("key")),
    all<{ scope: string; key: string; content: unknown }>(() => adminDb.from(tbl(schema.cmsDrafts)).select("scope,key,content").order("key")),
  ]);

  const refs: Ref[] = [
    ...items.map((i) => ({ id: i.mediaId, label: `Album “${i.album?.title ?? "?"}”` })),
    ...albums.flatMap((a) => [a.coverId, a.beforeId, a.afterId].map((id) => ({ id, label: `Album “${a.title}” cover` }))),
    ...services.flatMap((s) => [s.imageId, ...(s.galleryIds ?? [])].map((id) => ({ id, label: `Service “${s.name}”` }))),
    ...packages.flatMap((p) => [p.imageId, ...(p.galleryIds ?? [])].map((id) => ({ id, label: `Package “${p.name}”` }))),
    ...testimonials.map((t) => ({ id: t.photoId, label: `Testimonial from ${t.customerName}` })),
    ...catalogue.map((c) => ({ id: c.imageId, label: `Catalogue “${c.name}”` })),
    ...staff.map((s) => ({ id: s.photoId, label: "Staff photo" })),
    ...eventTypes.map((e) => ({ id: e.imageId, label: `Event type “${e.name}”` })),
    ...inventory.map((i) => ({ id: i.imageId, label: `Inventory “${i.name}”` })),
    ...seo.map((s) => ({ id: s.ogImageId, label: `Share image for ${s.path}` })),
    // JSON content: any id mentioned anywhere inside it
    ...sections.flatMap((s) => idsIn(s.content).map((id) => ({ id, label: `Homepage “${s.key}”` }))),
    ...settings.flatMap((s) => idsIn(s.value).map((id) => ({ id, label: `Setting “${s.key}”` }))),
    ...drafts.flatMap((d) => idsIn(d.content).map((id) => ({ id, label: `Unpublished draft (${d.key})` }))),
  ];

  const usage = new Map<string, string[]>();
  for (const r of refs) {
    if (!r.id) continue;
    const id = r.id.toLowerCase();
    const list = usage.get(id) ?? [];
    if (!list.includes(r.label)) list.push(r.label);
    usage.set(id, list);
  }
  return usage;
}

const idsIn = (v: unknown) => [...new Set(JSON.stringify(v ?? null).match(UUID) ?? [])];
