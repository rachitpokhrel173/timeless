"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, exec, many, maybe, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
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
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  position: zs.int().default(0),
});

const albums = () => db.from(tbl(schema.galleryAlbums));

export const createAlbum = adminAction("cms.manage", albumFields, async (input, user) => {
  let slug = slugify(input.slug || input.title);
  if (await maybe(albums().select("id").eq("slug", slug))) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const row = await one<{ id: string }>(albums().insert(vals(schema.galleryAlbums, { ...input, slug })).select("id"));
  await audit(user, "create", "gallery_album", row.id, `Created gallery album ${input.title}`);
  refreshSite();
  redirect(`/admin/website/gallery/${row.id}`);
});

export const updateAlbum = adminAction("cms.manage", albumFields.extend({ id: zs.uuid() }), async ({ id, ...input }, user) => {
  const slug = slugify(input.slug || input.title);
  const clash = await maybe<{ id: string }>(albums().select("id").eq("slug", slug).neq("id", id));
  if (clash) throw new UserError("Another album uses that URL name.", { slug: "Already used." });
  await exec(albums().update(vals(schema.galleryAlbums, { ...input, slug, placeholder: false })).eq("id", id));
  await audit(user, "update", "gallery_album", id, `Updated gallery album ${input.title}`);
  refreshSite();
});

export const saveGalleryItem = adminAction(
  "cms.manage",
  z.object({ id: zs.uuid(), title: zs.optional(160), caption: zs.optional(500), featured: z.boolean().default(false), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }),
  async ({ id, ...input }, user) => {
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
