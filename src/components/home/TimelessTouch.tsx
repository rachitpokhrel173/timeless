import Image from "next/image";
import type { CSSProperties } from "react";
import { CircleCheck } from "lucide-react";
import type { HomeContent } from "@/types";
import Reveal from "@/components/ui/Reveal";
import SectionTitle from "@/components/ui/SectionTitle";

/** Edge-to-edge photo on the left, statement and a short checklist of what we style on the right. */
export default function TimelessTouch({ touch }: { touch: HomeContent["touch"] }) {
  return (
    <section aria-labelledby="touch-title" className="grid bg-sand lg:grid-cols-[0.95fr_1.6fr]">
      <Reveal variant="curtain" className="relative aspect-[16/9] overflow-hidden lg:aspect-auto lg:min-h-[19rem]">
        <Image
          src={touch.image.src}
          alt={touch.image.alt}
          fill
          sizes="(min-width: 1024px) 38vw, 100vw"
          className="object-cover"
          style={{ objectPosition: touch.image.focus }}
        />
      </Reveal>

      <div className="grid gap-10 px-5 py-14 md:px-12 md:py-16 lg:grid-cols-[1.6fr_auto] lg:items-center lg:gap-12 xl:px-16">
        <Reveal>
          <SectionTitle id="touch-title" eyebrow={touch.eyebrow} title={touch.heading} size="sm" className="[&_h2]:text-[clamp(1.6rem,2.4vw,2.1rem)]" />
          <p className="mt-5 max-w-lg leading-[1.8] text-muted">{touch.body}</p>
        </Reveal>

        <Reveal delay={100}>
          <ul className="space-y-3 border-ink/15 lg:border-l lg:py-2 lg:pl-10">
            {touch.items.map((item, i) => (
              <li key={item} className="touch-item flex items-center gap-3 text-[0.92rem] text-ink/80" style={{ "--i": i } as CSSProperties}>
                <CircleCheck className="size-4 shrink-0 text-gold-deep" strokeWidth={1.5} aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
