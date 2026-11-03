"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, exec, many, maybe, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { publicMediaIds, recordPublication } from "@/server/cms";
import { copyEventPhotoToWebsite, eventPhotoCandidates } from "@/server/gallery";
import { refreshSite } from "@/server/revalidate";

const CATEGORIES = ["weddings", "engagements", "pasni", "birthdays", "corporate", "other"] as const;
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);

const albumFields = z.object({
  title: zs.required("Title", 160),
  slug: zs.optional(70),
  category: z.enum(CATEGORIES),
  eventType: zs.optional(60),
  description: zs.optional(2000),
  location: zs.optional(160),
  eventDate: zs.date(),
  tags: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20),
    ),
  coverId: zs.optUuid(),
  eventId: zs.optUuid(),
  featured: z.boolean().default(false),
  position: zs.int().default(0),
});

const albums = () => db.from(tbl(schema.galleryAlbums));

/** Only website images can be a cover — never a private event photo. */
async function checkCover(coverId: string | null | undefined) {
  if (coverId && !(await publicMediaIds([coverId])).length) throw new UserError("Choose a website image as the cover.", { coverId: "Not a website image." });
}

/** New albums start as drafts — publish them from the album page. */
export const createAlbum = adminAction("cms.manage", albumFields, async (input, user) => {
  await checkCover(input.coverId);
  let slug = slugify(input.slug || input.title);
  if (await maybe(albums().select("id").eq("slug", slug))) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const row = await one<{ id: string }>(albums().insert(vals(schema.galleryAlbums, { ...input, slug, status: "DRAFT" })).select("id"));
  await audit(user, "create", "gallery_album", row.id, `Created gallery album ${input.title}`);
  refreshSite();
  redirect(`/admin/website/gallery/${row.id}`);
});

export const updateAlbum = adminAction("cms.manage", albumFields.extend({ id: zs.uuid() }), async ({ id, ...input }, user) => {
  const slug = slugify(input.slug || input.title);
  const clash = await maybe<{ id: string }>(albums().select("id").eq("slug", slug).neq("id", id));
  if (clash) throw new UserError("Another album uses that URL name.", { slug: "Already used." });
  await checkCover(input.coverId);
  await exec(albums().update(vals(schema.galleryAlbums, { ...input, slug, placeholder: false })).eq("id", id));
  await audit(user, "update", "gallery_album", id, `Updated gallery album ${input.title}`);
  refreshSite();
});

/** Publish, unpublish or archive an album. Publishing needs at least one visible photo. */
export const setAlbumStatus = adminAction("cms.manage", z.object({ id: zs.uuid(), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }), async ({ id, status }, user) => {
  const a = await one<{ title: string; publishedAt: string | null; coverId: string | null }>(albums().select("title,publishedAt:published_at,coverId:cover_id").eq("id", id));
  if (status === "PUBLISHED") {
    const visible = await maybe(db.from(tbl(schema.galleryItems)).select("id").eq("album_id", id).eq("status", "PUBLISHED").limit(1));
    if (!visible) throw new UserError("Show at least one photo in this album before publishing it.");
  }
  await exec(albums().update({ status, placeholder: false, ...(status === "PUBLISHED" && { published_at: a.publishedAt ?? new Date().toISOString() }) }).eq("id", id));
  const action = status === "PUBLISHED" ? "PUBLISH" : status === "ARCHIVED" ? "ARCHIVE" : "UNPUBLISH";
  await recordPublication("album", id, action, user, a.title);
  await audit(user, action.toLowerCase(), "gallery_album", id, `${status === "PUBLISHED" ? "Published" : status === "ARCHIVED" ? "Archived" : "Unpublished"} gallery album ${a.title}`);
  refreshSite();
});

/**
 * Add photos from the album's linked (completed) event. Each chosen photo is copied into the
 * website media library; the private original stays private. Copies are added hidden, so nothing
 * appears on the website until someone reviews and shows them.
 */
export const importEventPhotos = adminAction("cms.manage", z.object({ albumId: zs.uuid(), mediaIds: z.array(zs.uuid()).min(1, "Choose at least one photo.").max(40) }), async ({ albumId, mediaIds }, user) => {
  const album = await one<{ eventId: string | null; title: string }>(albums().select("eventId:event_id,title").eq("id", albumId));
  if (!album.eventId) throw new UserError("Link this album to an event first.");
  const candidates = await eventPhotoCandidates(album.eventId);
  if (!candidates.ok) throw new UserError(candidates.reason);
  const allowed = new Map(candidates.photos.map((p) => [p.id, p]));
  const chosen = mediaIds.filter((id) => allowed.has(id));
  if (chosen.length !== mediaIds.length) throw new UserError("Some of those photos don't belong to this event. Refresh and try again.");

  const existing = new Set((await many<{ mediaId: string }>(db.from(tbl(schema.galleryItems)).select("mediaId:media_id").eq("album_id", albumId))).map((r) => r.mediaId));
  const last = await maybe<{ position: number }>(db.from(tbl(schema.galleryItems)).select("position").eq("album_id", albumId).order("position", { ascending: false }).limit(1));
  let position = (last?.position ?? -1) + 1;
  let added = 0;
  for (const id of chosen) {
    const copy = await copyEventPhotoToWebsite(allowed.get(id)!, user.id);
    if (existing.has(copy.id)) continue;
    await exec(db.from(tbl(schema.galleryItems)).insert(vals(schema.galleryItems, { albumId, mediaId: copy.id, position: position++, status: "DRAFT" })));
    existing.add(copy.id);
    added++;
  }
  await audit(user, "upload", "gallery_album", albumId, `Added ${added} photo(s) from the event to ${album.title} (hidden until shown)`);
  return { added };
});

export const saveGalleryItem = adminAction(
  "cms.manage",
  z.object({ id: zs.uuid(), title: zs.optional(160), caption: zs.optional(500), alt: zs.optional(300), featured: z.boolean().default(false), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }),
  async ({ id, alt, ...input }, user) => {
    const item = await one<{ mediaId: string }>(db.from(tbl(schema.galleryItems)).select("mediaId:media_id").eq("id", id));
    // Alt text lives on the image, so it's the same everywhere the image is used (website images only)
    if (!(await publicMediaIds([item.mediaId])).length) throw new UserError("This photo isn't a website image. Remove it and add it again.");
    if (input.status === "PUBLISHED" && !(alt ?? "").trim()) throw new UserError("Describe the photo before showing it on the website.", { alt: "Required to show the photo." });
    await exec(db.from(tbl(schema.media)).update({ alt: alt ?? "" }).eq("id", item.mediaId));
    await exec(db.from(tbl(schema.galleryItems)).update(vals(schema.galleryItems, input)).eq("id", id));
    await audit(user, "update", "gallery_item", id, "Edited a gallery photo");
    refreshSite();
  },
);

export const moveGalleryItem = adminAction("cms.manage", z.object({ id: zs.uuid(), direction: z.enum(["up", "down"]) }), async ({ id, direction }) => {
  const item = await one<{ albumId: string }>(db.from(tbl(schema.galleryItems)).select("albumId:album_id").eq("id", id));
  const list = await many<{ id: string }>(db.from(tbl(schema.galleryItems)).select("id").eq("album_id", item.albumId).order("position").order("created_at"));
  const i = list.findIndex((x) => x.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  for (const [position, x] of list.entries()) await exec(db.from(tbl(schema.galleryItems)).update({ position }).eq("id", x.id));
  refreshSite();
});

export const setAlbumCover = adminAction("cms.manage", z.object({ albumId: zs.uuid(), mediaId: zs.uuid() }), async ({ albumId, mediaId }, user) => {
  await checkCover(mediaId);
  await exec(albums().update({ cover_id: mediaId }).eq("id", albumId));
  await audit(user, "update", "gallery_album", albumId, "Changed the album cover");
  refreshSite();
});

/** Removes the photo from the album; the image stays in the media library. */
export const removeGalleryItem = adminAction("cms.manage", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  await exec(db.from(tbl(schema.galleryItems)).delete().eq("id", id));
  await audit(user, "delete", "gallery_item", id, "Removed a photo from an album");
  refreshSite();
});
