import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeContent } from "@/types";
import Reveal from "@/components/ui/Reveal";
import Rich from "@/components/ui/Rich";
import SectionTitle from "@/components/ui/SectionTitle";

/** Title on the left, four tall photo tiles on the right. Two per row on phones. */
export default function ServiceCards({ services }: { services: HomeContent["services"] }) {
  return (
    <section aria-labelledby="services-title" className="bg-sand py-16 md:py-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 md:px-8 lg:grid-cols-[0.75fr_2fr] lg:items-start lg:gap-12 2xl:max-w-[84rem]">
        <Reveal className="lg:pt-4">
          <SectionTitle id="services-title" eyebrow={services.eyebrow} title={services.heading} size="sm" />
          <Link href="/services" className="group mt-7 inline-flex items-center gap-2 text-sm font-medium text-ink underline underline-offset-4 decoration-ink/30 hover:decoration-ink">
            View All Services
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </Link>
        </Reveal>

        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {services.items.map((s, i) => (
            <Reveal as="li" key={s.id} delay={i * 110} variant="curtain">
              <Link href={`/services#${s.slug}`} className="group relative block aspect-[4/5] overflow-hidden rounded-[6px] bg-forest md:aspect-[5/6]">
                <Image
                  src={s.image.src}
                  alt={s.image.alt}
                  fill
                  sizes="(min-width: 1024px) 220px, (min-width: 768px) 24vw, 46vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  style={{ objectPosition: s.image.focus }}
                />
                <span className="absolute inset-0 bg-gradient-to-t from-forest-deep/85 via-forest-deep/10 to-transparent transition-opacity duration-500 group-hover:opacity-90" aria-hidden />
                <h3 className="absolute inset-x-0 bottom-0 flex items-end gap-2 p-4 font-serif transition-transform duration-500 ease-out group-hover:-translate-y-1.5 text-[1.2rem] leading-[1.15] font-medium text-ivory md:text-[1.3rem]">
                  <span>
                    <Rich text={s.name} />
                  </span>
                  <ArrowRight className="mb-1 size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                </h3>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
