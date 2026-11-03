import "server-only";
import sharp from "sharp";
import { adminDb, cols, db, inUserContext, one, schema, tbl, vals, type Row } from "@/db";
import { makePath, putFile, type Bucket } from "./storage";

const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const DOC_TYPES = [
  "application/pdf",
  ...IMAGE_TYPES,
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
];

export class UploadError extends Error {}

/** What sharp must detect for each declared image type (the browser's type is only a claim). */
const IMAGE_FORMAT: Record<string, string[]> = { "image/jpeg": ["jpeg"], "image/png": ["png"], "image/webp": ["webp"], "image/avif": ["heif", "avif"], "image/gif": ["gif"] };

/** Check the file's first bytes match its declared document type. */
function looksLike(mime: string, b: Buffer) {
  const starts = (...bytes: number[]) => bytes.every((x, i) => b[i] === x);
  switch (mime) {
    case "application/pdf":
      return starts(0x25, 0x50, 0x44, 0x46); // %PDF
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return starts(0x50, 0x4b, 0x03, 0x04); // zip
    case "application/msword":
    case "application/vnd.ms-excel":
      return starts(0xd0, 0xcf, 0x11, 0xe0); // OLE
    case "text/csv":
    case "text/plain":
      return !b.subarray(0, 8192).includes(0);
    default:
      return true;
  }
}

export type ProcessedFile = { body: Buffer; mime: string; filename: string; width: number | null; height: number | null };

/**
 * Validate a file and optimise images: auto-rotate, strip metadata (e.g. GPS), cap at 2400px and
 * convert to WebP. The website then serves AVIF/WebP sizes through next/image.
 */
export async function processUpload(file: File, opts: { imagesOnly?: boolean } = {}): Promise<ProcessedFile> {
  if (file.size === 0) throw new UploadError("The file is empty.");
  if (file.size > MAX_BYTES) throw new UploadError("Files must be 15 MB or smaller.");
  const allowed = opts.imagesOnly ? IMAGE_TYPES : DOC_TYPES;
  if (!allowed.includes(file.type)) throw new UploadError(opts.imagesOnly ? "Upload a JPEG, PNG, WebP, AVIF or GIF image." : "That file type isn't allowed.");

  let body: Buffer = Buffer.from(await file.arrayBuffer());
  let mime = file.type;
  let filename = file.name || "upload";
  let width: number | null = null;
  let height: number | null = null;
  if (!IMAGE_TYPES.includes(file.type) && !looksLike(file.type, body)) throw new UploadError("That file's contents don't match its type.");
  if (IMAGE_TYPES.includes(file.type)) {
    let format: string | undefined;
    try {
      format = (await sharp(body).metadata()).format;
    } catch {
      throw new UploadError("That image couldn't be read. Try a different file.");
    }
    // Must really be a raster image we accept (never SVG/HTML). GIFs are stored as-is, so they must match exactly;
    // everything else is re-encoded to WebP, so a PNG saved as .jpg is fine.
    const ok = file.type === "image/gif" ? format === "gif" : !!format && format !== "gif" && Object.values(IMAGE_FORMAT).flat().includes(format);
    if (!ok) throw new UploadError("That file isn't the kind of image its name says. Export it again as JPEG, PNG or WebP.");
    try {
      if (file.type === "image/gif") {
        const meta = await sharp(body).metadata();
        width = meta.width ?? null;
        height = meta.pageHeight ?? meta.height ?? null;
      } else {
        const { data, info } = await sharp(body)
          .rotate()
          .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
        body = data;
        mime = "image/webp";
        filename = filename.replace(/\.\w+$/, "") + ".webp";
        width = info.width;
        height = info.height;
      }
    } catch {
      throw new UploadError("That image couldn't be read. Try a different file.");
    }
  }
  return { body, mime, filename, width, height };
}

/** Upload to a bucket and register it in the media library. */
export async function storeUpload(
  file: File,
  opts: { bucket: Bucket; folder?: string; alt?: string; title?: string; tags?: string[]; uploadedBy?: string | null; imagesOnly?: boolean },
) {
  const processed = await processUpload(file, { imagesOnly: opts.imagesOnly ?? opts.bucket !== "private-documents" });
  const folder = opts.folder ?? "General";
  const stored = await putFile(opts.bucket, makePath(folder.toLowerCase(), processed.filename), processed.body, processed.mime);
  const conn = inUserContext() ? db : adminDb;
  const values = vals(schema.media, {
    bucket: opts.bucket,
    path: stored.path,
    url: stored.url,
    filename: processed.filename,
    title: opts.title ?? file.name.replace(/\.\w+$/, "").replace(/[-_]+/g, " "),
    alt: opts.alt ?? "",
    mime: processed.mime,
    size: processed.body.length,
    width: processed.width,
    height: processed.height,
    folder,
    tags: opts.tags ?? [],
    uploadedBy: opts.uploadedBy ?? null,
  });
  return one<Row<typeof schema.media>>(conn.from(tbl(schema.media)).insert(values).select(cols(schema.media)));
}

/** Media row → the ImageAsset shape the public components expect. */
export function toImageAsset(m: { url: string | null; alt: string; width: number | null; height: number | null; tags?: string[] } | null | undefined, fallbackAlt = "") {
  if (!m?.url) return undefined;
  const focus = m.tags?.find((t) => t.startsWith("focus:"))?.slice(6);
  return { src: m.url, alt: m.alt || fallbackAlt, width: m.width ?? 1600, height: m.height ?? 1067, ...(focus && { focus }) };
}
