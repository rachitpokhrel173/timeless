import Image from "next/image";
import type { Testimonial } from "@/types";
import { formatDate } from "@/lib/utils";
import PlaceholderBadge from "@/components/ui/PlaceholderBadge";
import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

/** Renders nothing when there are no (real) testimonials to show. */
export default function Testimonials({ testimonials }: { testimonials: Testimonial[] }) {
  if (testimonials.length === 0) return null;

  return (
    <section aria-labelledby="testimonials-title" className="bg-sand py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <SectionHeading id="testimonials-title" align="center" eyebrow="Kind words" title="From the Families We've Celebrated With" />
        </Reveal>

        <ul className="mt-12 grid gap-4 md:mt-16 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {testimonials.map((t, i) => (
            <Reveal as="li" key={t.id} delay={i * 100}>
              <figure className="flex h-full flex-col rounded-2xl bg-ivory p-7 md:p-9">
                <span className="font-serif text-6xl leading-[0.5] text-gold" aria-hidden>
                  &ldquo;
                </span>
                <blockquote className="mt-6 flex-1 font-serif text-xl leading-snug md:text-[1.4rem]">{t.quote}</blockquote>
                <figcaption className="mt-8 flex items-center gap-4 border-t border-ink/10 pt-6">
                  {t.photo && (
                    <Image src={t.photo.src} alt="" width={48} height={48} className="size-12 rounded-full object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.customerName}</p>
                    <p className="text-sm text-muted">
                      {t.eventType}
                      {t.date && ` · ${formatDate(t.date)}`}
                    </p>
                  </div>
                  {t.placeholder && <PlaceholderBadge className="text-gold-deep" />}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
