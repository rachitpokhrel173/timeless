import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import InquiryCTA from "@/components/cta/InquiryCTA";
import CatalogueGrid from "@/components/catalogue/CatalogueGrid";
import PriceListCard from "@/components/catalogue/PriceListCard";
import Reveal from "@/components/ui/Reveal";
import SectionTitle from "@/components/ui/SectionTitle";
import { buttonClass } from "@/components/ui/ButtonLink";
import { images } from "@/data/images";
import { INQUIRY_PATH } from "@/data/site";
import { getCatalogue, getCatalogueMeta, getPriceLists } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { pad2 } from "@/lib/utils";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata({
  title: "Décor Catalogue & Price List",
  description:
    "Wedding stage, entrance, aisle and backdrop décor with prices, plus rates for panche baja, band, tentage, lights, sound and rentals in Kathmandu.",
  path: "/catalogue",
});

export default async function CataloguePage() {
  const [sections, priceLists, { offerings, priceNote: PRICE_NOTE }] = await Promise.all([getCatalogue(), getPriceLists(), getCatalogueMeta()]);
  // Baja, tents, lights and rentals each get their own link
  const jumpLinks = [...sections.map((s) => ({ href: `#${s.slug}`, label: s.name })), ...priceLists.map((l) => ({ href: `#${l.slug}`, label: l.name }))];

  return (
    <>
      <PageHeader
        eyebrow="Catalogue & prices"
        title="Décor Catalogue"
        subtitle="Stages, entrances, aisles and backdrops we set up, with their starting prices. Every design can be adapted to your colours, venue and budget."
      />

      <nav aria-label="Catalogue sections" className="border-b border-ink/10 bg-ivory">
        <ul className="scroll-row mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 py-4 md:flex-wrap md:justify-center md:px-8">
          {jumpLinks.map((link) => (
            <li key={link.href} className="shrink-0">
              <a
                href={link.href}
                className="inline-flex h-9 items-center rounded-full border border-ink/15 px-4 text-[0.82rem] tracking-wide text-ink/80 transition-colors hover:border-burgundy hover:text-burgundy"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto max-w-7xl space-y-20 px-5 py-16 md:space-y-28 md:px-8 md:py-24">
        {sections.map((section, i) => (
          <section key={section.id} id={section.slug} aria-labelledby={`${section.slug}-title`} className="scroll-mt-28">
            <Reveal className="mb-8 flex flex-col gap-3 border-b border-ink/10 pb-6 md:mb-10 md:flex-row md:items-end md:justify-between md:gap-10">
              <div>
                <span className="font-serif text-lg text-gold-deep">{pad2(i + 1)}</span>
                <h2 id={`${section.slug}-title`} className="mt-2 font-serif text-[2.3rem] leading-[1.05] font-medium md:text-5xl">
                  {section.name}
                </h2>
              </div>
              <p className="max-w-md text-muted md:text-right">{section.intro}</p>
            </Reveal>
            <CatalogueGrid section={section} />
          </section>
        ))}
        <p className="text-center text-sm text-muted">*{PRICE_NOTE} Flower colours and sizes can be changed to suit your theme.</p>
      </div>

      <section id="rates" aria-labelledby="rates-title" className="scroll-mt-28 bg-sand py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <SectionTitle
            id="rates-title"
            eyebrow="Rate card"
            title="Baja, Tents, Lights & *Rentals*"
            intro="Music, tentage, sound and furniture you can book on their own or add to any décor package."
            align="center"
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2 md:gap-6">
            {priceLists.map((list) => (
              <PriceListCard key={list.id} list={list} />
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted">*{PRICE_NOTE}</p>
        </div>
      </section>

      <section aria-labelledby="offer-title" className="bg-forest py-16 text-ivory md:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 md:px-8 lg:grid-cols-[0.8fr_2fr] lg:gap-16">
          <div>
            <SectionTitle id="offer-title" eyebrow="What we offer" title="One team for the *whole* celebration" tone="light" />
            <Link href={INQUIRY_PATH} className={`${buttonClass("peach", "sm")} mt-8`}>
              Get a Quote
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>
          <ul className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
            {offerings.map((o) => (
              <li key={o} className="flex items-baseline gap-3 border-b border-ivory/12 py-3.5 text-[0.95rem] text-ivory/90">
                <span className="size-1.5 shrink-0 translate-y-[-0.15em] rotate-45 bg-gold-light" aria-hidden />
                {o}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <InquiryCTA image={images.grandMandap} />
    </>
  );
}
