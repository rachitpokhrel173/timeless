import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { EventType } from "@/types";
import { inquiryHref } from "@/lib/utils";
import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

/** Occasion tiles — each one starts an inquiry with that event type pre-selected. */
export default function EventTypes({ eventTypes }: { eventTypes: EventType[] }) {
  return (
    <section aria-labelledby="occasions-title" className="bg-ink py-20 text-ivory md:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <SectionHeading
            id="occasions-title"
            tone="dark"
            align="center"
            eyebrow="Occasions"
            title="Celebrate Every Occasion"
            description="Weddings and receptions, pasni and bratabandha, birthdays, office functions and quiet anniversaries — each one styled for the people in the room."
          />
        </Reveal>

        <ul className="mt-12 grid grid-cols-2 gap-3 md:mt-16 md:gap-4 lg:grid-cols-4">
          {eventTypes.map((e, i) => (
            <Reveal as="li" key={e.id} delay={(i % 4) * 70}>
              <Link
                href={inquiryHref(e.slug)}
                className="group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-xl bg-ivory/5 p-4 md:aspect-[3/4] md:p-5"
              >
                {e.image && (
                  <Image
                    src={e.image.src}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 25vw, 50vw"
                    className="-z-10 object-cover transition-transform duration-[1.2s] ease-[var(--ease-soft)] group-hover:scale-[1.07]"
                    style={{ objectPosition: e.image.focus }}
                  />
                )}
                <span className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent transition-colors duration-500 group-hover:from-ink/90 group-hover:via-ink/40" aria-hidden />
                <h3 className="font-serif text-xl leading-tight font-medium md:text-2xl">{e.name}</h3>
                <span className="mt-1 flex items-center gap-1.5 text-[0.68rem] tracking-[0.08em] whitespace-nowrap text-gold-light uppercase sm:text-xs sm:tracking-[0.12em] transition-transform duration-500 md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-visible:translate-y-0 md:group-focus-visible:opacity-100">
                  Plan yours
                  <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
