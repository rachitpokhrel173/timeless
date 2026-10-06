import { Star } from "lucide-react";
import type { Testimonial } from "@/types";
import Reveal from "@/components/ui/Reveal";
import SectionTitle from "@/components/ui/SectionTitle";

type Props = { eyebrow: string; heading: string; intro: string; items: Testimonial[] };

/**
 * Three review cards. Content comes from the testimonials data (admin-managed); placeholder
 * records are labelled and filtered out in production, which hides the section.
 */
export default function Testimonials({ eyebrow, heading, intro, items }: Props) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="testimonials-title" className="bg-ivory pt-16 md:pt-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 md:px-8 lg:grid-cols-[0.75fr_2fr] lg:items-start lg:gap-12 2xl:max-w-[84rem]">
        <Reveal>
          <SectionTitle id="testimonials-title" eyebrow={eyebrow} title={heading} intro={intro} size="sm" />
        </Reveal>

        <ul className="grid gap-4 md:grid-cols-3 md:gap-5">
          {items.slice(0, 3).map((t, i) => (
            <Reveal as="li" key={t.id} delay={i * 80}>
              <figure className="h-full rounded-[6px] bg-paper p-6 shadow-[0_1px_0_rgb(44_34_36/0.04),0_14px_34px_-30px_rgb(44_34_36/0.5)] transition-[transform,box-shadow] duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_26px_50px_-30px_rgb(44_34_36/0.55)]">
                <span className="block font-serif text-[2.6rem] leading-[0.6] text-gold select-none" aria-hidden>
                  &ldquo;
                </span>
                <blockquote className="mt-3 text-[0.88rem] leading-relaxed text-ink/75 italic">{t.quote}</blockquote>
                <figcaption className="mt-5 text-[0.82rem] text-ink">
                  — {t.customerName}
                  <span className="text-muted"> · {t.eventType}</span>
                  {t.rating ? (
                    <span className="mt-2 flex gap-0.5 text-gold" aria-label={`${t.rating} out of 5 stars`}>
                      {Array.from({ length: t.rating }, (_, n) => (
                        <Star key={n} className="size-3.5 fill-current" aria-hidden />
                      ))}
                    </span>
                  ) : null}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
