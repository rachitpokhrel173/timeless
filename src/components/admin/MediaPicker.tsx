"use client";

import { useMemo, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { Button, Dialog, inputClass } from "./interactive";

export type MediaOption = { id: string; url: string | null; alt: string; title: string | null; folder: string };

/**
 * Choose an image from the media library. Submits the chosen media id under `name`.
 * New images are uploaded on Website → Media.
 */
export default function MediaPicker({ name, label, media, defaultValue }: { name: string; label: string; media: MediaOption[]; defaultValue?: string | null }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = media.find((m) => m.id === value);
  const shown = useMemo(() => media.filter((m) => `${m.title ?? ""} ${m.alt} ${m.folder}`.toLowerCase().includes(q.toLowerCase())).slice(0, 120), [media, q]);
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium">{label}</p>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-a-border bg-a-subtle">
          {current?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
            <img src={current.url} alt={current.alt} className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-5 text-a-muted" aria-hidden />
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => setOpen(true)}>
            {current ? "Change image" : "Choose image"}
          </Button>
          {current && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => setValue("")}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={label} description="Upload new images on Website → Media." size="xl">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search images…" aria-label="Search images" className={`${inputClass} mb-3`} />
        {shown.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-a-muted">No images found.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {shown.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setValue(m.id);
                    setOpen(false);
                  }}
                  className={`block w-full overflow-hidden rounded-md border-2 ${m.id === value ? "border-a-accent" : "border-transparent hover:border-a-strong"}`}
                  aria-label={`Use ${m.title || m.alt || "image"}`}
                >
                  {m.url && (
                    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                    <img src={m.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}
