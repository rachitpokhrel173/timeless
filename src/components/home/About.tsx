import Image from "next/image";
import { Flower2, Gem, Sparkles, type LucideIcon } from "lucide-react";
import type { FeatureIcon, HomeContent } from "@/types";
import Botanical from "@/components/brand/Botanical";
import Reveal from "@/components/ui/Reveal";
import SectionTitle from "@/components/ui/SectionTitle";

const ICONS: Record<FeatureIcon, LucideIcon> = { design: Flower2, details: Gem, execution: Sparkles };

/** Photo with a soft arched corner on the left, story and three promises on the right. */
export default function About({ about }: { about: HomeContent["about"] }) {
  return (
    <section aria-labelledby="about-title" className="bg-ivory py-20 md:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 md:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 2xl:max-w-[84rem]">
        <div className="relative mr-10 sm:mr-16">
          <Reveal variant="curtain" className="relative aspect-[4/3] overflow-hidden rounded-tr-[45%] rounded-bl-[6px] shadow-[0_30px_60px_-40px_rgb(44_34_36/0.6)]">
            <Image
              src={about.image.src}
              alt={about.image.alt}
              fill
              sizes="(min-width: 1024px) 40vw, 90vw"
              className="object-cover"
              style={{ objectPosition: about.image.focus }}
            />
          </Reveal>
          <Reveal delay={700} className="absolute -right-12 bottom-6 sm:-right-16">
            <Botanical variant="sprig" className="h-36 w-auto rotate-[14deg] text-gold sm:h-44" strokeWidth={1.2} />
          </Reveal>
        </div>

        <Reveal delay={100}>
          <SectionTitle id="about-title" eyebrow={about.eyebrow} title={about.heading} size="sm" />
          <p className="mt-5 max-w-xl leading-[1.8] text-muted">{about.body}</p>
          <ul className="mt-9 grid gap-6 sm:grid-cols-3">
            {about.features.map((f) => {
              const Icon = ICONS[f.icon];
              return (
                <li key={f.title} className="group flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-peach/60 text-gold-deep transition-[transform,background-color] duration-500 ease-out group-hover:-rotate-12 group-hover:bg-peach">
                    <Icon className="size-5" strokeWidth={1.4} aria-hidden />
                  </span>
                  <span>
                    <span className="block font-serif text-[1.15rem] leading-tight font-medium">{f.title}</span>
                    <span className="mt-1 block text-[0.82rem] text-muted">{f.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
