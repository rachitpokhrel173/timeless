import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import InquiryCTA from "@/components/cta/InquiryCTA";
import { images } from "@/data/images";
import { getServices } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { pad2 } from "@/lib/utils";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata({
  title: "Wedding & Event Decoration Services",
  description:
    "Wedding, reception, haldi and mehendi décor, birthday and party decoration, corporate events, pasni and bratabandha setups across Kathmandu.",
  path: "/services",
});

export default async function ServicesPage() {
  const services = await getServices();

  return (
    <>
      <PageHeader
        eyebrow="What we do"
        title="Our Services"
        subtitle="Décor, styling and event support for every kind of celebration across the Kathmandu Valley."
      />
      <section className="mx-auto max-w-7xl space-y-20 px-5 py-20 md:space-y-28 md:px-8 md:py-28">
        {services.map((s, i) => (
          <article key={s.id} id={s.slug} className="grid scroll-mt-28 items-center gap-8 md:grid-cols-2 md:gap-16">
            <div className={`relative aspect-[4/3] overflow-hidden rounded-2xl bg-cream ${i % 2 ? "md:order-2" : ""}`}>
              <Image
                src={s.image.src}
                alt={s.image.alt}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
                style={{ objectPosition: s.image.focus }}
              />
            </div>
            <div>
              <span className="font-serif text-lg text-gold-deep">{pad2(i + 1)}</span>
              <h2 className="mt-3 font-serif text-4xl leading-tight font-medium md:text-5xl">{s.name}</h2>
              <p className="mt-5 text-lg leading-relaxed text-muted">{s.description}</p>
              <Link
                href="/contact#inquiry"
                className="group mt-8 inline-flex items-center gap-2 border-b border-ink/30 pb-1 text-sm font-medium tracking-wide hover:border-gold-deep hover:text-gold-deep"
              >
                Ask about {s.name.toLowerCase()}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </div>
          </article>
        ))}
      </section>
      <InquiryCTA image={images.grandMandap} />
    </>
  );
}
