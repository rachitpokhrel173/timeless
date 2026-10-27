"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { useToast } from "@/components/admin/interactive";
import { removeQuoteImage, uploadQuoteImages } from "../upload-actions";

const LIMIT = 12;
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/** Uploads images picked before the quotation existed; returns an error message or null. */
export async function uploadPendingImages(quotationId: string, files: File[]): Promise<string | null> {
  if (!files.length) return null;
  const form = new FormData();
  form.set("quotationId", quotationId);
  for (const f of files) form.append("file", f);
  try {
    const r = await uploadQuoteImages(form);
    return r.ok ? null : r.error;
  } catch {
    return "The upload failed — check your connection and try again.";
  }
}

/** Image picker for a quotation that isn't saved yet: files are held locally and uploaded after creation. */
export function PendingImages({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const room = LIMIT - files.length;

  const add = (picked: File[]) => {
    const bad = picked.find((f) => !TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) return toast("error", `“${bad.name}” must be a PNG, JPG or WEBP image up to 5MB.`);
    if (picked.length > room) return toast("error", `You can add ${room} more image${room === 1 ? "" : "s"} (${LIMIT} max).`);
    onChange([...files, ...picked]);
  };

  return (
    <section className="border-t border-a-border pt-4">
      <h2 className="text-base font-semibold">Reference Images</h2>
      <p className="text-[13px] text-a-muted">Design mockups, venue photos, or inspiration — uploaded when you create the quotation.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {files.map((f, i) => (
          <div key={previews[i]} className="group relative size-24 overflow-hidden rounded-xl border border-a-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img src={previews[i]} alt={f.name} className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              aria-label="Remove image"
              className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
        {room > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex size-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-a-border text-[13px] text-a-muted hover:bg-a-hover hover:text-a-text"
          >
            <ImagePlus className="size-5" aria-hidden />
            Add
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-a-muted">PNG, JPG, or WEBP — up to 5MB each, {LIMIT} images max.</p>
      <input
        ref={inputRef}
        type="file"
        accept={TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length) add(picked);
        }}
      />
    </section>
  );
}

/** Design mockups, venue photos or inspiration attached to a quotation (shown on the client's copy). */
export default function ReferenceImages({ quotationId, images, canEdit }: { quotationId: string; images: { id: string; src: string; alt: string }[]; canEdit: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const room = LIMIT - images.length;

  const upload = (files: File[]) => {
    const bad = files.find((f) => !TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) return toast("error", `“${bad.name}” must be a PNG, JPG or WEBP image up to 5MB.`);
    if (files.length > room) return toast("error", `You can add ${room} more image${room === 1 ? "" : "s"} (${LIMIT} max).`);
    const form = new FormData();
    form.set("quotationId", quotationId);
    for (const f of files) form.append("file", f);
    start(async () => {
      let r;
      try {
        r = await uploadQuoteImages(form);
      } catch {
        r = { ok: false as const, error: "The upload failed — check your connection and try again." };
      }
      if (r.ok) {
        toast("success", `${files.length} image${files.length === 1 ? "" : "s"} added`);
        router.refresh();
      } else toast("error", r.error);
    });
  };

  const remove = (mediaId: string) => {
    setRemoving(mediaId);
    start(async () => {
      const r = await removeQuoteImage(quotationId, mediaId).catch(() => ({ ok: false as const, error: "Couldn't remove that image." }));
      setRemoving(null);
      if (r.ok) router.refresh();
      else toast("error", r.error);
    });
  };

  return (
    <section>
      <h2 className="text-base font-semibold">Reference Images</h2>
      <p className="text-[13px] text-a-muted">Design mockups, venue photos, or inspiration to attach to this quotation.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {images.map((img) => (
          <div key={img.id} className="group relative size-24 overflow-hidden rounded-xl border border-a-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link */}
            <img src={img.src} alt={img.alt} className="size-full object-cover" />
            {canEdit && (
              <button
                type="button"
                onClick={() => remove(img.id)}
                disabled={pending}
                aria-label="Remove image"
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-60"
              >
                {removing === img.id ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
              </button>
            )}
          </div>
        ))}
        {canEdit && room > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="flex size-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-a-border text-[13px] text-a-muted hover:bg-a-hover hover:text-a-text disabled:opacity-60"
          >
            {pending && !removing ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
            {pending && !removing ? "Uploading" : "Add"}
          </button>
        )}
        {!canEdit && images.length === 0 && <p className="text-[13px] text-a-muted">No images attached.</p>}
      </div>
      {canEdit && (
        <>
          <p className="mt-3 text-xs text-a-muted">PNG, JPG, or WEBP — up to 5MB each, {LIMIT} images max.</p>
          <input
            ref={inputRef}
            type="file"
            accept={TYPES.join(",")}
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) upload(files);
            }}
          />
        </>
      )}
    </section>
  );
}
