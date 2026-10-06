import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { Service } from "@/types";
import { cn } from "@/lib/utils";
import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

/**
 * Editorial photo grid. Mobile: a swipeable row so eight services don't become a very long
 * scroll. Tablet/desktop: a mosaic led by one large feature tile.
 */
export default function ServicesGrid({ services }: { services: Service[] }) {
  const last = services.length - 1;

  return (
    <section id="services" aria-labelledby="services-title" className="py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <SectionHeading
            id="services-title"
            eyebrow="What we design"
            title="Everything You Need to Celebrate Beautifully"
            description="From intimate gatherings to grand celebrations, we create décor experiences designed around your event."
          />
          <Link
            href="/services"
            className="group inline-flex shrink-0 items-center gap-2 border-b border-ink/30 pb-1 text-sm font-medium tracking-wide transition-colors hover:border-gold-deep hover:text-gold-deep"
          >
            View all services
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </Reveal>

        <ul
          className={cn(
            "scroll-row mt-10 -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 md:mt-14",
            "md:mx-0 md:grid md:auto-rows-[17rem] md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:auto-rows-[16rem] lg:grid-cols-4",
          )}
        >
          {services.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                "relative aspect-[4/5] w-[78%] shrink-0 snap-start sm:w-[46%] md:aspect-auto md:w-auto",
                i === 0 && "md:col-span-2 lg:row-span-2",
                i === last && "md:col-span-2",
              )}
            >
              <Link
                href={`/services#${s.slug}`}
                className="group relative isolate flex h-full flex-col justify-end overflow-hidden rounded-2xl bg-cream p-5 text-ivory md:p-6"
              >
                <Image
                  src={s.image.src}
                  alt=""
                  fill
                  sizes={i === 0 ? "(min-width: 1024px) 50vw, (min-width: 768px) 100vw, 80vw" : "(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 80vw"}
                  className="-z-10 object-cover transition-transform duration-[1.2s] ease-[var(--ease-soft)] group-hover:scale-[1.06]"
                  style={{ objectPosition: s.image.focus }}
                />
                <span className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" aria-hidden />
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h3 className={cn("font-serif leading-tight font-medium", i === 0 ? "text-3xl md:text-4xl" : "text-2xl")}>
                      {s.name}
                    </h3>
                    <p className="mt-1 text-sm text-ivory/80">{s.summary}</p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-ivory/40 transition-colors duration-300 group-hover:border-gold-light group-hover:bg-gold-light group-hover:text-ink">
                    <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden />
                    <span className="sr-only">Explore</span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-xs tracking-[0.2em] text-muted uppercase md:hidden" aria-hidden>
          Swipe to see more
        </p>
      </div>
    </section>
  );
}
