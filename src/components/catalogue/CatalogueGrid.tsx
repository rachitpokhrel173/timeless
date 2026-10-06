"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Expand } from "lucide-react";
import type { CatalogueSection } from "@/types";
import { INQUIRY_PATH } from "@/data/site";
import { cn, formatPrice } from "@/lib/utils";
import Lightbox, { type Slide } from "@/components/gallery/Lightbox";

// Literal class names so Tailwind can see them
const SPAN = { 3: "md:col-span-3 md:[&_.photo]:aspect-[4/5]", 4: "md:col-span-4 md:[&_.photo]:aspect-square", 6: "md:col-span-6 md:[&_.photo]:aspect-[4/3]" } as const;

/** Two even rows on a 12-column grid: a few large cards on top, the rest smaller below. */
function spanFor(i: number, n: number): keyof typeof SPAN {
  const top = n <= 5 ? 2 : 3;
  const rest = n - top;
  if (i < top) return (12 / top) as 4 | 6;
  return rest === 2 ? 6 : rest === 3 ? 4 : 3;
}

/** One catalogue section's photo cards; tapping a card opens it larger with its price. */
export default function CatalogueGrid({ section }: { section: CatalogueSection }) {
  const [openAt, setOpenAt] = useState<number | null>(null);

  const slides: Slide[] = section.items.map((item) => ({
    item: { id: item.id, title: `${item.title} · ${formatPrice(item.price)}`, category: "other", image: item.image, featured: false },
    image: item.image,
    category: section.name,
  }));

  return (
    <>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-7 md:grid-cols-12 md:gap-x-5 md:gap-y-10">
        {section.items.map((item, i) => {
          const onRequest = item.price.amount === undefined;
          return (
            <li
              key={item.id}
              // On phones an odd first card spans the full width so the rest pair up
              className={cn(SPAN[spanFor(i, section.items.length)], i === 0 && section.items.length % 2 === 1 && "col-span-2 [&_.photo]:aspect-[4/3]")}
            >
              <button type="button" onClick={() => setOpenAt(i)} className="group block w-full text-left">
                <span className="photo relative block aspect-[4/5] overflow-hidden rounded-[6px] bg-cream">
                  <Image
                    src={item.image.src}
                    alt={item.image.alt}
                    fill
                    sizes="(min-width: 1280px) 620px, (min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-[1.2s] ease-[var(--ease-soft)] group-hover:scale-[1.05]"
                  />
                  <span className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-ivory/85 text-ink opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden>
                    <Expand className="size-4" strokeWidth={1.5} />
                  </span>
                </span>
                <span className="mt-3 block font-serif text-[1.2rem] leading-tight font-medium md:text-[1.35rem]">{item.title}</span>
                <span className={`mt-1 block text-[0.82rem] tracking-wide ${onRequest ? "text-muted italic" : "font-semibold text-burgundy"}`}>
                  {formatPrice(item.price)}
                </span>
                <span className="sr-only">— open larger view</span>
              </button>
              <Link
                href={`${INQUIRY_PATH}?design=${item.id}#inquiry`}
                className="group/enq mt-2 inline-flex items-center gap-1.5 border-b border-ink/25 pb-0.5 text-[0.78rem] tracking-wide text-ink/80 hover:border-burgundy hover:text-burgundy"
              >
                Enquire<span className="sr-only"> about {item.title}</span>
                <ArrowRight className="size-3.5 transition-transform group-hover/enq:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <Lightbox slides={slides} index={openAt} onIndexChange={setOpenAt} />
    </>
  );
}
