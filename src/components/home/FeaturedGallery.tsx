"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Expand } from "lucide-react";
import type { GalleryItem } from "@/types";
import { galleryCategories } from "@/data/gallery";
import Lightbox, { type Slide } from "@/components/gallery/Lightbox";
import Reveal from "@/components/ui/Reveal";
import SectionTitle from "@/components/ui/SectionTitle";
import { cn } from "@/lib/utils";

/** One large photo beside two stacked ones. */
const PLACEMENT = ["col-span-2 aspect-[4/3] md:col-span-1 md:row-span-2 md:aspect-auto", "aspect-[4/3] md:aspect-auto", "aspect-[4/3] md:aspect-auto"];

const categoryLabel = (c: GalleryItem["category"]) => galleryCategories.find((g) => g.value === c)?.label ?? "";

type Props = { eyebrow: string; heading: string; intro: string; items: GalleryItem[] };

export default function FeaturedGallery({ eyebrow, heading, intro, items }: Props) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const shown = items.slice(0, PLACEMENT.length);
  const slides: Slide[] = shown.map((item) => ({ item, image: item.image, category: categoryLabel(item.category) }));

  return (
    <section aria-labelledby="gallery-title" className="bg-ivory py-16 md:py-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 md:px-8 lg:grid-cols-[0.75fr_2fr] lg:items-start lg:gap-12 2xl:max-w-[84rem]">
        <Reveal className="lg:pt-4">
          <SectionTitle id="gallery-title" eyebrow={eyebrow} title={heading} intro={intro} size="sm" />
          <Link href="/gallery" className="group mt-7 inline-flex items-center gap-2 text-sm font-medium text-ink underline underline-offset-4 decoration-ink/30 hover:decoration-ink">
            View Full Gallery
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </Link>
        </Reveal>

        <ul className="grid grid-cols-2 gap-3 md:grid-cols-[1.45fr_1fr] md:auto-rows-[clamp(9rem,13vw,11.5rem)] md:gap-4">
          {shown.map((item, i) => (
            <Reveal as="li" key={item.id} delay={i * 140} variant="curtain" className={cn("relative", PLACEMENT[i])}>
              <button
                type="button"
                onClick={() => setOpenAt(i)}
                aria-label={`Open photo: ${item.title}`}
                className="group absolute inset-0 overflow-hidden rounded-[6px] bg-sand"
              >
                <Image
                  src={item.image.src}
                  alt={item.image.alt}
                  fill
                  sizes={i === 0 ? "(min-width: 768px) 45vw, 100vw" : "(min-width: 768px) 30vw, 50vw"}
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                  style={{ objectPosition: item.image.focus }}
                />
                <span className="absolute inset-0 bg-gradient-to-t from-forest-deep/75 via-transparent to-transparent" aria-hidden />
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-4 text-left text-ivory">
                  <span className="flex items-center gap-2 font-serif text-[1.15rem] leading-tight md:text-[1.25rem]">
                    {item.title}
                    <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                  </span>
                  <Expand className="size-4 opacity-70 transition-opacity group-hover:opacity-100" strokeWidth={1.6} aria-hidden />
                </span>
              </button>
            </Reveal>
          ))}
        </ul>
      </div>

      <Lightbox slides={slides} index={openAt} onIndexChange={setOpenAt} />
    </section>
  );
}
