import "server-only";
import sharp from "sharp";
import { adminDb, cols, db, many, maybe, one, schema, tbl, vals, type Row } from "@/db";
import { makePath, putFile, readStoredFile, signedUrl } from "./storage";

/*
 * Completed event → gallery album.
 *
 * Event photos live in the private event-media bucket. Staff choose which ones go on the website;
 * each chosen photo is copied (re-encoded, metadata stripped) into public-media with
 * source_media_id pointing at the original, so the original never becomes public and choosing the
 * same photo twice reuses the copy. Reference/inspiration images (other people's work) and
 * non-image files are never offered.
 */

export type EventPhoto = { id: string; path: string; mime: string; title: string | null; createdAt: string; source: "work" | "design" };

const EXCLUDED = /\/references\//;

export async function eventPhotoCandidates(eventId: string): Promise<{ ok: true; photos: EventPhoto[] } | { ok: false; reason: string }> {
  const ev = await maybe<{ status: string }>(db.from(tbl(schema.events)).select("status").eq("id", eventId));
  if (!ev) return { ok: false, reason: "The linked event couldn't be found." };
  if (ev.status !== "COMPLETED") return { ok: false, reason: "Photos can be added once the event is marked completed." };
  const rows = await many<{ id: string; path: string; mime: string; title: string | null; createdAt: string }>(
    adminDb
      .from(tbl(schema.media))
      .select("id,path,mime,title,createdAt:created_at")
      .eq("bucket", "event-media")
      .like("path", `events/${eventId}/%`)
      .like("mime", "image/%")
      .is("deleted_at", null)
      .order("created_at")
      .limit(300),
  );
  return {
    ok: true,
    photos: rows.filter((r) => !EXCLUDED.test(r.path) && r.mime !== "image/gif").map((r) => ({ ...r, source: r.path.startsWith(`events/${eventId}/work/`) ? "work" : "design" })),
  };
}

/** Short-lived thumbnails for the picker (staff only — callers check cms.manage first). */
export async function withThumbnails(photos: EventPhoto[]) {
  return Promise.all(photos.map(async (p) => ({ ...p, thumb: await signedUrl("event-media", p.path, 900).catch(() => null) })));
}

/** The website copy of a private event photo, made on first use. */
export async function copyEventPhotoToWebsite(photo: EventPhoto, uploadedBy: string): Promise<{ id: string }> {
  const existing = await maybe<{ id: string }>(db.from(tbl(schema.media)).select("id").eq("bucket", "public-media").eq("source_media_id", photo.id).is("deleted_at", null));
  if (existing) return existing;
  const original = await readStoredFile("event-media", photo.path);
  if (!original) throw new Error(`Event photo ${photo.id} is missing from storage`);
  // Re-encode: strips EXIF/GPS and anything that isn't image data
  const { data, info } = await sharp(original).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const filename = `${(photo.title || "event-photo").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) || "event-photo"}.webp`;
  const stored = await putFile("public-media", makePath("gallery", filename), data, "image/webp");
  return one<Row<typeof schema.media>>(
    db
      .from(tbl(schema.media))
      .insert(
        vals(schema.media, {
          bucket: "public-media",
          path: stored.path,
          url: stored.url,
          filename,
          title: photo.title,
          alt: "",
          mime: "image/webp",
          size: data.length,
          width: info.width,
          height: info.height,
          folder: "Gallery",
          tags: [],
          uploadedBy,
          sourceMediaId: photo.id,
        }),
      )
      .select(cols(schema.media)),
  );
}
