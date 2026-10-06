"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Expand } from "lucide-react";
import type { GalleryCategory, GalleryItem } from "@/types";
import { cn } from "@/lib/utils";
import Lightbox, { type Slide } from "./Lightbox";

type Filter = GalleryCategory | "all";

type Props = {
  items: GalleryItem[];
  categories: { value: Filter; label: string }[];
  /** Label for the filter group, for screen readers. */
  label?: string;
};

/** Filterable masonry grid; tapping a photo opens the lightbox on the current filter's photos. */
export default function Gallery({ items, categories, label = "Filter photos by event type" }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openAt, setOpenAt] = useState<number | null>(null);

  const categoryLabel = useMemo(() => new Map(categories.map((c) => [c.value, c.label])), [categories]);
  const visible = filter === "all" ? items : items.filter((i) => i.category === filter);

  // Albums: an item's extra images follow its cover in the lightbox
  const slides: Slide[] = visible.flatMap((item) =>
    [item.image, ...(item.images ?? [])].map((image) => ({ item, image, category: categoryLabel.get(item.category) ?? "" })),
  );
  const firstSlideOf = (id: string) => slides.findIndex((s) => s.item.id === id);

  // Only offer filters that have photos
  const available = categories.filter((c) => c.value === "all" || items.some((i) => i.category === c.value));

  return (
    <div>
      <div role="group" aria-label={label} className="scroll-row -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
        {available.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={filter === c.value}
            onClick={() => setFilter(c.value)}
            className={cn(
              "h-10 shrink-0 rounded-full border px-5 text-sm tracking-wide transition-colors",
              filter === c.value ? "border-ink bg-ink text-ivory" : "border-ink/20 text-ink/75 hover:border-ink hover:text-ink",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        Showing {visible.length} {visible.length === 1 ? "photo" : "photos"}
      </p>

      <ul className="mt-8 columns-2 gap-3 md:columns-3 md:gap-5">
        {visible.map((item) => (
          <li key={item.id} className="mb-3 break-inside-avoid md:mb-5">
            <button
              type="button"
              onClick={() => setOpenAt(firstSlideOf(item.id))}
              className="group relative block w-full overflow-hidden rounded-xl bg-cream text-left"
            >
              <Image
                src={item.image.src}
                alt={item.image.alt}
                width={item.image.width}
                height={item.image.height}
                sizes="(min-width: 1280px) 400px, (min-width: 768px) 33vw, 50vw"
                className="h-auto w-full transition-transform duration-[1.2s] ease-[var(--ease-soft)] group-hover:scale-[1.04]"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-ink/75 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-ivory opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100">
                <span>
                  <span className="block text-[0.65rem] tracking-[0.2em] text-gold-light uppercase">
                    {categoryLabel.get(item.category)}
                  </span>
                  <span className="mt-1 block font-serif text-lg leading-tight">{item.title}</span>
                </span>
                <Expand className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="sr-only">Open larger view: {item.title}</span>
            </button>
          </li>
        ))}
      </ul>

      {visible.length === 0 && <p className="py-16 text-center text-muted">No photos in this category yet.</p>}

      <Lightbox slides={slides} index={openAt} onIndexChange={setOpenAt} />
    </div>
  );
}
