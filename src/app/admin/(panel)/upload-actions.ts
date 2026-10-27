"use server";

import { cols, db, exec, maybe, one, schema, tbl, vals, withUser, type Row } from "@/db";
import { UserError, type ActionResult } from "@/lib/actions";
import { audit } from "@/lib/audit";
import type { Permission } from "@/lib/auth/permissions";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { processUpload, storeUpload, UploadError } from "@/server/media";
import { refreshSite } from "@/server/revalidate";
import { deleteStoredFile, makePath, putFile } from "@/server/storage";

const uuid = (v: FormDataEntryValue | null) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const text = (v: FormDataEntryValue | null, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Like adminAction, for multipart uploads. */
async function upload<T>(permission: Permission | Permission[], form: FormData, handler: (files: File[], user: SessionUser) => Promise<T>): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user?.isStaff) return { ok: false, error: "Your session has ended. Please sign in again." };
  const needed = Array.isArray(permission) ? permission : [permission];
  if (!needed.some((p) => user.permissions.has(p))) return { ok: false, error: "You don't have permission to do that." };
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: "Choose a file to upload." };
  if (files.length > 20) return { ok: false, error: "Upload up to 20 files at a time." };
  try {
    return { ok: true, data: await withUser(() => handler(files, user)) };
  } catch (error) {
    if (error instanceof UploadError || error instanceof UserError) return { ok: false, error: error.message };
    console.error("[upload]", error);
    return { ok: false, error: "The upload failed. Please try again." };
  }
}

const KINDS = ["QUOTATION", "CONTRACT", "INVOICE", "RECEIPT", "EVENT_BRIEF", "DESIGN", "CLIENT_UPLOAD", "EXPENSE_RECEIPT", "OTHER"] as const;

/** Private documents (contracts, receipts, briefs) — stored in the private bucket, opened via signed links. */
export async function uploadDocument(form: FormData) {
  return upload("documents.manage", form, async (files, user) => {
    const kind = (KINDS as readonly string[]).includes(text(form.get("kind"))) ? (text(form.get("kind")) as (typeof KINDS)[number]) : "OTHER";
    const links = { eventId: uuid(form.get("eventId")), customerId: uuid(form.get("customerId")), bookingId: uuid(form.get("bookingId")) };
    if (!links.eventId && !links.customerId && !links.bookingId) throw new UserError("Attach the document to a record.");
    const shared = form.get("shared") === "on" || form.get("shared") === "true";
    for (const file of files) {
      const p = await processUpload(file);
      const stored = await putFile("private-documents", makePath(links.eventId ? `events/${links.eventId}` : `customers/${links.customerId ?? links.bookingId}`, p.filename), p.body, p.mime);
      await exec(
        db.from(tbl(schema.documents)).insert(
          vals(schema.documents, {
            kind,
            title: text(form.get("title")) || file.name.replace(/\.\w+$/, ""),
            bucket: "private-documents",
            path: stored.path,
            mime: p.mime,
            size: p.body.length,
            ...links,
            sharedWithCustomer: shared,
            uploadedBy: user.id,
          }),
        ),
      );
    }
    await audit(user, "upload", "document", links.eventId ?? links.customerId, `Uploaded ${files.length} document(s)`);
    return { count: files.length };
  });
}

export async function deleteDocument(id: string) {
  const user = await getCurrentUser();
  if (!user?.permissions.has("documents.manage")) return { ok: false as const, error: "You don't have permission to do that." };
  try {
    await withUser(async () => {
      const d = await one<{ bucket: string; path: string; title: string }>(db.from(tbl(schema.documents)).update({ deleted_at: new Date().toISOString() }).eq("id", id).select("bucket,path,title"));
      await deleteStoredFile(d.bucket, d.path);
      await audit(user, "delete", "document", id, `Deleted document “${d.title}”`);
    });
    return { ok: true as const, data: undefined };
  } catch (error) {
    console.error("[document delete]", error);
    return { ok: false as const, error: "Couldn't delete that document." };
  }
}

/** Design files for an approval round (private event-media bucket). */
export async function uploadDesignFiles(form: FormData) {
  return upload("events.update", form, async (files, user) => {
    const designId = uuid(form.get("designId"));
    if (!designId) throw new UserError("Choose a design.");
    const design = await maybe<Row<typeof schema.designApprovals>>(db.from(tbl(schema.designApprovals)).select(cols(schema.designApprovals)).eq("id", designId));
    if (!design) throw new UserError("Design not found.");
    const ids: string[] = [];
    for (const file of files) ids.push((await storeUpload(file, { bucket: "event-media", folder: `events/${design.eventId}`, uploadedBy: user.id, imagesOnly: false })).id);
    await exec(db.from(tbl(schema.designApprovals)).update({ media_ids: [...design.mediaIds, ...ids] }).eq("id", designId));
    await audit(user, "upload", "event", design.eventId, `Added ${ids.length} file(s) to design “${design.title}”`);
    return { count: ids.length };
  });
}

/** Website images (public bucket), optionally straight into a gallery album. */
export async function uploadMedia(form: FormData) {
  return upload("cms.manage", form, async (files, user) => {
    const folder = text(form.get("folder"), 60) || "Website";
    const albumId = uuid(form.get("albumId"));
    const created: { id: string; url: string | null }[] = [];
    for (const file of files) {
      const m = await storeUpload(file, { bucket: "public-media", folder, alt: text(form.get("alt"), 300), uploadedBy: user.id, imagesOnly: true });
      created.push({ id: m.id, url: m.url });
    }
    if (albumId) {
      const last = await maybe<{ position: number }>(db.from(tbl(schema.galleryItems)).select("position").eq("album_id", albumId).order("position", { ascending: false }).limit(1));
      const start = (last?.position ?? -1) + 1;
      await exec(db.from(tbl(schema.galleryItems)).insert(created.map((m, i) => vals(schema.galleryItems, { albumId, mediaId: m.id, position: start + i, status: "PUBLISHED" }))));
      refreshSite();
    }
    await audit(user, "upload", "media", albumId, `Uploaded ${created.length} image(s)${albumId ? " to a gallery album" : ""}`);
    return { media: created };
  });
}

const QUOTE_IMAGE_LIMIT = 12;
const CUSTOMER_IMAGE_LIMIT = 30;
const QUOTE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Reference & inspiration images on a quotation (private event-media bucket, shown via signed links). */
export async function uploadQuoteImages(form: FormData) {
  return upload(["quotations.create", "quotations.update"], form, async (files, user) => {
    const quotationId = uuid(form.get("quotationId"));
    if (!quotationId) throw new UserError("Save the quotation first.");
    const quote = await maybe<{ number: string; ids: string[] }>(db.from(tbl(schema.quotations)).select("number,ids:reference_media_ids").eq("id", quotationId).is("deleted_at", null));
    if (!quote) throw new UserError("Quotation not found.");
    if (quote.ids.length + files.length > QUOTE_IMAGE_LIMIT) throw new UserError(`Up to ${QUOTE_IMAGE_LIMIT} images per quotation — remove some first.`);
    for (const f of files) {
      if (!QUOTE_IMAGE_TYPES.includes(f.type)) throw new UserError(`“${f.name}” isn't a PNG, JPG or WEBP image.`);
      if (f.size > 5 * 1024 * 1024) throw new UserError(`“${f.name}” is over 5 MB.`);
    }
    const ids: string[] = [];
    for (const file of files) ids.push((await storeUpload(file, { bucket: "event-media", folder: `quotations/${quotationId}`, uploadedBy: user.id, imagesOnly: true })).id);
    await exec(db.from(tbl(schema.quotations)).update({ reference_media_ids: [...quote.ids, ...ids] }).eq("id", quotationId));
    await audit(user, "upload", "quotation", quotationId, `Added ${ids.length} reference image(s) to ${quote.number}`);
    return { count: ids.length };
  });
}

export async function removeQuoteImage(quotationId: string, mediaId: string): Promise<ActionResult<undefined>> {
  const user = await getCurrentUser();
  if (!user?.permissions.has("quotations.update")) return { ok: false, error: "You don't have permission to do that." };
  if (!uuid(quotationId) || !uuid(mediaId)) return { ok: false, error: "Image not found." };
  try {
    await withUser(async () => {
      const quote = await one<{ number: string; ids: string[] }>(db.from(tbl(schema.quotations)).select("number,ids:reference_media_ids").eq("id", quotationId));
      if (!quote.ids.includes(mediaId)) throw new UserError("Image not found.");
      await exec(db.from(tbl(schema.quotations)).update({ reference_media_ids: quote.ids.filter((i) => i !== mediaId) }).eq("id", quotationId));
      // Duplicated quotations share their images; only delete the file when nothing else uses it
      const shared = await maybe<{ id: string }>(db.from(tbl(schema.quotations)).select("id").contains("reference_media_ids", [mediaId]).limit(1));
      if (!shared) {
        const m = await maybe<{ bucket: string; path: string }>(db.from(tbl(schema.media)).update({ deleted_at: new Date().toISOString() }).eq("id", mediaId).select("bucket,path"));
        if (m) await deleteStoredFile(m.bucket, m.path);
      }
      await audit(user, "update", "quotation", quotationId, `Removed a reference image from ${quote.number}`);
    });
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    console.error("[quote image remove]", error);
    return { ok: false, error: "Couldn't remove that image." };
  }
}

/** Venue photos, inspiration and references on a customer (private event-media bucket, shown via signed links). */
export async function uploadCustomerImages(form: FormData) {
  return upload("customers.update", form, async (files, user) => {
    const customerId = uuid(form.get("customerId"));
    if (!customerId) throw new UserError("Customer not found.");
    const customer = await maybe<{ name: string; ids: string[] }>(db.from(tbl(schema.customers)).select("name,ids:reference_media_ids").eq("id", customerId).is("deleted_at", null));
    if (!customer) throw new UserError("Customer not found.");
    if (customer.ids.length + files.length > CUSTOMER_IMAGE_LIMIT) throw new UserError(`Up to ${CUSTOMER_IMAGE_LIMIT} photos per customer — remove some first.`);
    for (const f of files) {
      if (!QUOTE_IMAGE_TYPES.includes(f.type)) throw new UserError(`“${f.name}” isn't a PNG, JPG or WEBP image.`);
      if (f.size > 5 * 1024 * 1024) throw new UserError(`“${f.name}” is over 5 MB.`);
    }
    const ids: string[] = [];
    for (const file of files) ids.push((await storeUpload(file, { bucket: "event-media", folder: `customers/${customerId}`, uploadedBy: user.id, imagesOnly: true })).id);
    await exec(db.from(tbl(schema.customers)).update({ reference_media_ids: [...customer.ids, ...ids] }).eq("id", customerId));
    await audit(user, "upload", "customer", customerId, `Added ${ids.length} photo(s) for ${customer.name}`);
    return { count: ids.length };
  });
}

export async function removeCustomerImage(customerId: string, mediaId: string): Promise<ActionResult<undefined>> {
  const user = await getCurrentUser();
  if (!user?.permissions.has("customers.update")) return { ok: false, error: "You don't have permission to do that." };
  if (!uuid(customerId) || !uuid(mediaId)) return { ok: false, error: "Photo not found." };
  try {
    await withUser(async () => {
      const customer = await one<{ name: string; ids: string[] }>(db.from(tbl(schema.customers)).select("name,ids:reference_media_ids").eq("id", customerId));
      if (!customer.ids.includes(mediaId)) throw new UserError("Photo not found.");
      await exec(db.from(tbl(schema.customers)).update({ reference_media_ids: customer.ids.filter((i) => i !== mediaId) }).eq("id", customerId));
      const m = await maybe<{ bucket: string; path: string }>(db.from(tbl(schema.media)).update({ deleted_at: new Date().toISOString() }).eq("id", mediaId).select("bucket,path"));
      if (m) await deleteStoredFile(m.bucket, m.path);
      await audit(user, "update", "customer", customerId, `Removed a photo for ${customer.name}`);
    });
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    console.error("[customer image remove]", error);
    return { ok: false, error: "Couldn't remove that photo." };
  }
}
