import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ImageAsset } from "@/types";
import { pad2 } from "@/lib/utils";
import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

type Props = {
  reasons: { title: string; text: string }[];
  images: { primary: ImageAsset; secondary: ImageAsset };
};

/** Editorial split: layered photographs beside a ruled, numbered list. */
export default function WhyChooseUs({ reasons, images }: Props) {
  return (
    <section aria-labelledby="why-title" className="bg-sand py-20 md:py-28 lg:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 md:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <Reveal className="relative mx-auto w-full max-w-md pb-12 lg:max-w-none lg:pb-16">
          <div className="relative ml-auto aspect-[4/5] w-[82%] overflow-hidden rounded-t-full rounded-b-2xl bg-cream">
            <Image
              src={images.primary.src}
              alt={images.primary.alt}
              fill
              sizes="(min-width: 1024px) 38vw, 80vw"
              className="object-cover"
              style={{ objectPosition: images.primary.focus ?? "50% 55%" }}
            />
          </div>
          <div className="absolute bottom-0 left-0 aspect-square w-[46%] overflow-hidden rounded-2xl border-[6px] border-sand bg-cream shadow-xl shadow-ink/10">
            <Image
              src={images.secondary.src}
              alt={images.secondary.alt}
              fill
              sizes="(min-width: 1024px) 20vw, 45vw"
              className="object-cover"
            />
          </div>
        </Reveal>

        <div>
          <Reveal>
            <SectionHeading
              id="why-title"
              eyebrow="Why Timeless Tie"
              title={
                <>
                  Designed Around <em className="font-normal text-gold-deep">Your</em> Celebration
                </>
              }
            />
          </Reveal>

          <ol className="mt-10 border-t border-ink/15">
            {reasons.map((r, i) => (
              <Reveal as="li" key={r.title} delay={i * 90} className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-ink/15 py-6 md:grid-cols-[3.5rem_1fr]">
                <span className="pt-1 font-serif text-lg text-gold-deep">{pad2(i + 1)}</span>
                <div>
                  <h3 className="font-serif text-2xl leading-tight font-medium md:text-[1.7rem]">{r.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{r.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>

          <Link
            href="/about"
            className="group mt-9 inline-flex items-center gap-2 border-b border-ink/30 pb-1 text-sm font-medium tracking-wide transition-colors hover:border-gold-deep hover:text-gold-deep"
          >
            About our studio
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
