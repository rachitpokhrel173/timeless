"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ImageIcon, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Dialog, inputClass, useRun } from "./interactive";
import type { MediaOption } from "./MediaPicker";
import type { ActionResult } from "@/lib/actions";

/*
 * Edits structured website content (homepage sections, About, FAQs…) by walking its JSON shape:
 * text → inputs, string lists → one-per-line, groups → repeatable cards, images → media library.
 * Text supports "\n" for a line break and *word* for the italic accent, as on the live site.
 */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
type Img = { src: string; alt: string; width?: number; height?: number; focus?: string; mediaId?: string };

const HIDDEN = new Set(["id", "mediaId", "width", "height", "src", "slug"]);
const LABELS: Record<string, string> = {
  placeholder: "Sample content (hidden on the live site)",
  simulateBefore: "Use a greyed copy of the after photo as “before”",
  eventType: "Event type (for the inquiry form)",
  cta: "Button text",
  focus: "Image focus point (e.g. 50% 30%)",
};
const human = (k: string) => LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const isObj = (v: Json): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isImg = (v: Json): v is Img & Obj => isObj(v) && typeof v.src === "string" && "alt" in v;

function blank(v: Json): Json {
  if (typeof v === "string") return "";
  if (typeof v === "number") return 0;
  if (typeof v === "boolean") return false;
  if (Array.isArray(v)) return [];
  if (isImg(v)) return { src: "", alt: "", width: 1600, height: 1067 };
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "id" ? `item-${Date.now().toString(36)}` : blank(x)]));
  return null;
}

export default function ContentEditor({
  initial,
  media,
  onSave,
  saveLabel = "Save",
}: {
  initial: Json;
  media: MediaOption[];
  onSave: (json: string) => Promise<ActionResult<unknown>>;
  saveLabel?: string;
}) {
  const [value, setValue] = useState<Json>(initial);
  const [dirty, setDirty] = useState(false);
  const { run, pending } = useRun();
  const set = (v: Json) => {
    setValue(v);
    setDirty(true);
  };
  return (
    <div className="space-y-4">
      <Node value={value} onChange={set} media={media} path="" />
      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-a-border bg-a-surface px-4 py-3">
        {dirty && <span className="mr-auto text-xs text-a-warning">Unsaved changes</span>}
        <Button variant="primary" pending={pending} disabled={!dirty} onClick={() => run(() => onSave(JSON.stringify(value)), { success: "Saved — the website is updated", onSuccess: () => setDirty(false) })}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

function Node({ value, onChange, media, path, label }: { value: Json; onChange: (v: Json) => void; media: MediaOption[]; path: string; label?: string }) {
  const id = `ce-${path.replace(/[^a-z0-9]/gi, "-")}`;
  if (typeof value === "string") {
    const long = value.length > 70 || value.includes("\n") || /body|intro|text|description|paragraph|answer|^a$/i.test(label ?? "");
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-[13px] font-medium">
            {label}
          </label>
        )}
        {long ? (
          <textarea id={id} value={value} rows={Math.min(8, Math.max(2, Math.ceil(value.length / 90)))} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, "h-auto py-2 leading-relaxed")} />
        ) : (
          <input id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
        )}
      </div>
    );
  }
  if (typeof value === "number")
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-[13px] font-medium">
            {label}
          </label>
        )}
        <input id={id} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputClass} />
      </div>
    );
  if (typeof value === "boolean")
    return (
      <label className="flex items-center gap-2 text-[13px] font-medium">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--a-accent)]" />
        {label}
      </label>
    );
  if (value === null) return null;
  if (isImg(value)) return <ImageField label={label ?? "Image"} value={value} onChange={onChange} media={media} />;

  if (Array.isArray(value)) {
    const sample = value[0];
    // Lists of text: one per line
    if (value.every((v) => typeof v === "string"))
      return (
        <div className="space-y-1.5">
          {label && (
            <label htmlFor={id} className="block text-[13px] font-medium">
              {label} <span className="font-normal text-a-muted">— one per line</span>
            </label>
          )}
          <textarea
            id={id}
            rows={Math.max(3, value.length + 1)}
            value={(value as string[]).join("\n")}
            onChange={(e) => onChange(e.target.value.split("\n"))}
            onBlur={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
            className={cn(inputClass, "h-auto py-2")}
          />
        </div>
      );
    const move = (i: number, d: number) => {
      const next = [...value];
      const j = i + d;
      if (j < 0 || j >= next.length) return;
      [next[i], next[j]] = [next[j]!, next[i]!];
      onChange(next);
    };
    const images = sample !== undefined && isImg(sample);
    return (
      <fieldset className="space-y-2">
        {label && <legend className="mb-1 text-[13px] font-semibold">{label}</legend>}
        <div className={images ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
          {value.map((item, i) => (
            <div key={i} className="rounded-lg border border-a-border bg-a-subtle/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide text-a-muted uppercase">
                  {label ? `${label.replace(/s$/, "")} ${i + 1}` : `Item ${i + 1}`}
                </span>
                <span className="flex">
                  <Button size="icon-sm" variant="ghost" aria-label="Move up" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} />
                  <Button size="icon-sm" variant="ghost" aria-label="Move down" icon={ArrowDown} disabled={i === value.length - 1} onClick={() => move(i, 1)} />
                  <Button size="icon-sm" variant="danger-ghost" aria-label="Remove" icon={Trash2} onClick={() => onChange(value.filter((_, j) => j !== i))} />
                </span>
              </div>
              <Node value={item} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} media={media} path={`${path}.${i}`} />
            </div>
          ))}
        </div>
        {sample !== undefined && (
          <Button size="sm" icon={Plus} onClick={() => onChange([...value, blank(sample)])}>
            Add {label ? label.replace(/s$/, "").toLowerCase() : "item"}
          </Button>
        )}
      </fieldset>
    );
  }

  // Object: its fields in a responsive grid; images and groups take the full width
  const entries = Object.entries(value).filter(([k]) => !HIDDEN.has(k));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className={cn((Array.isArray(v) || isObj(v) || (typeof v === "string" && (v.length > 70 || v.includes("\n")))) && "sm:col-span-2")}>
          <Node value={v} label={human(k)} path={`${path}.${k}`} media={media} onChange={(x) => onChange({ ...value, [k]: x })} />
        </div>
      ))}
    </div>
  );
}

function ImageField({ label, value, onChange, media }: { label: string; value: Img & Obj; onChange: (v: Json) => void; media: MediaOption[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = media.filter((m) => `${m.title ?? ""} ${m.alt} ${m.folder}`.toLowerCase().includes(q.toLowerCase())).slice(0, 120);
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium">{label}</p>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => setOpen(true)} className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-a-border bg-a-subtle hover:border-a-strong" aria-label={`Choose ${label.toLowerCase()}`}>
          {value.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
            <img src={value.src} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-5 text-a-muted" aria-hidden />
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <input aria-label="Alt text" value={value.alt} onChange={(e) => onChange({ ...value, alt: e.target.value })} placeholder="Describe the image (alt text)" className={inputClass} />
          <Button size="sm" onClick={() => setOpen(true)}>
            {value.src ? "Change" : "Choose image"}
          </Button>
        </div>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Choose ${label.toLowerCase()}`} description="Upload new images on Website → Media." size="xl">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search images…" aria-label="Search images" className={cn(inputClass, "mb-3")} />
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {shown.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="block w-full overflow-hidden rounded-md border-2 border-transparent hover:border-a-strong"
                aria-label={`Use ${m.title || m.alt || "image"}`}
                onClick={() => {
                  onChange({ ...value, mediaId: m.id, src: m.url ?? "", alt: value.alt || m.alt });
                  setOpen(false);
                }}
              >
                {m.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                  <img src={m.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
