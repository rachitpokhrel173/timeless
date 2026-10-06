import { ArrowRight } from "lucide-react";
import type { GalleryItem } from "@/types";
import { galleryCategories } from "@/data/gallery";
import ButtonLink from "@/components/ui/ButtonLink";
import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";
import Gallery from "./Gallery";

export default function FeaturedWork({ items }: { items: GalleryItem[] }) {
  return (
    <section id="work" aria-labelledby="work-title" className="bg-sand py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="mb-10 md:mb-12">
          <SectionHeading
            id="work-title"
            eyebrow="Featured work"
            title="Moments We've Helped Create"
            description="Explore a glimpse of our recent event décor and celebrations."
          />
        </Reveal>

        <Gallery items={items} categories={galleryCategories} />

        <div className="mt-10 flex justify-center">
          <ButtonLink href="/gallery" variant="outline" size="lg">
            View the Full Gallery
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
