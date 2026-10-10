import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/env";

/*
 * File storage — Supabase Storage buckets (see supabase/migrations/00010_cms_gallery.sql):
 *   public-media       website images            public URL
 *   avatars            profile photos             public URL
 *   event-media        event photos, designs      private → signed URLs
 *   private-documents  quotations, invoices,      private → signed URLs
 *                      contracts, receipts, uploads
 *
 * Uploads happen on the server after a permission check (service-role client).
 */

export const BUCKETS = ["public-media", "avatars", "event-media", "private-documents"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const PUBLIC_BUCKETS: Bucket[] = ["public-media", "avatars"];
export const isPublicBucket = (b: string) => (PUBLIC_BUCKETS as string[]).includes(b);

/** Random, unguessable path keeping a readable file name at the end. */
export function makePath(folder: string, filename: string) {
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80);
  const cleanFolder = folder.replace(/[^a-zA-Z0-9/_-]+/g, "-").replace(/^\/+|\/+$/g, "");
  return `${cleanFolder}/${randomUUID()}-${safe || "file"}`;
}

export function publicUrl(bucket: Bucket, path: string) {
  if (!isPublicBucket(bucket)) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function putFile(bucket: Bucket, path: string, body: Buffer, contentType: string) {
  const { error } = await supabaseAdmin().storage.from(bucket).upload(path, body, { contentType, upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return { bucket, path, url: publicUrl(bucket, path) };
}

export async function readStoredFile(bucket: string, path: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin().storage.from(bucket).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteStoredFile(bucket: string, path: string) {
  if (bucket === "static") return; // shipped with the site in /public
  await supabaseAdmin().storage.from(bucket).remove([path]);
}

/**
 * Short-lived link to a private file. Call only after checking the viewer may see it.
 * `download` sets Content-Disposition: attachment.
 */
export async function signedUrl(bucket: string, path: string, expiresInSeconds = 300, download?: string) {
  const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(path, expiresInSeconds, download ? { download } : undefined);
  if (error || !data) throw new Error("Couldn't create a link to that file.");
  return data.signedUrl;
}

/** Connectivity check for System Health. */
export async function storageHealth(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { data, error } = await supabaseAdmin().storage.listBuckets();
    if (error) return { ok: false, detail: `Supabase Storage: ${error.message}` };
    const missing = BUCKETS.filter((b) => !data.some((x) => x.id === b));
    return missing.length ? { ok: false, detail: `Missing bucket(s): ${missing.join(", ")} — run the migrations` } : { ok: true, detail: "Supabase Storage (4 buckets)" };
  } catch {
    return { ok: false, detail: "Supabase Storage unreachable" };
  }
}
