import type { Metadata } from "next";
import Image from "next/image";
import PageHeader from "@/components/layout/PageHeader";
import InquiryCTA from "@/components/cta/InquiryCTA";
import { images } from "@/data/images";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About Us",
  description: "Meet Timeless Ties Events & Decor — wedding and event decorators based in Chabahil, Kathmandu.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <PageHeader eyebrow="Our studio" title="About Us" subtitle="Wedding décor · Event styling · Celebrations" />
      {/* TODO: replace with the client's real story, team photos and background */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:px-8 md:py-28">
        <div className="relative aspect-[4/5] overflow-hidden rounded-t-full rounded-b-2xl bg-cream">
          <Image
            src={images.coupleArchway.src}
            alt={images.coupleArchway.alt}
            fill
            sizes="(min-width: 768px) 45vw, 100vw"
            className="object-cover"
            style={{ objectPosition: images.coupleArchway.focus }}
          />
        </div>
        <div className="space-y-5 text-lg leading-relaxed text-muted">
          <h2 className="font-serif text-4xl leading-tight font-medium text-ink md:text-5xl">
            Celebrations, designed with care.
          </h2>
          <p>
            Timeless Ties Events & Decor is a Kathmandu-based décor studio. From intimate family functions to full
            wedding celebrations, we design and build the setting so you can focus on the people who matter.
          </p>
          <p>
            Every event starts with your ideas, your traditions and your budget. We turn them into a setup that feels
            personal — and we take care of it from the first sketch to the final finishing touch.
          </p>
        </div>
      </section>
      <InquiryCTA image={images.mandapBallroom} />
    </>
  );
}
