import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import type { HomeContent } from "@/types";
import { INQUIRY_PATH } from "@/data/site";
import { buttonClass } from "@/components/ui/ButtonLink";
import Rich from "@/components/ui/Rich";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

/**
 * Full-bleed photograph with the copy on the left. Pulled up under the transparent header
 * (see Navigation), so the negative margin must match the header height.
 * Motion: the photo slowly settles and drifts with scroll; the headline rises in line by line.
 */
export default function Hero({ hero }: { hero: HomeContent["hero"] }) {
  const lines = hero.headline.split("\n");

  return (
    <section aria-labelledby="hero-title" className="relative isolate -mt-[4.75rem] overflow-hidden bg-forest-deep text-ivory md:-mt-[5.5rem]">
      <div className="hero-drift absolute inset-0 -z-20">
        <Image
          src={hero.image.src}
          alt={hero.image.alt}
          fill
          preload
          loading="eager"
          fetchPriority="high"
          sizes="100vw"
          className="hero-zoom object-cover"
          style={{ objectPosition: hero.image.focus }}
        />
      </div>
      {/* Darken the left for legible copy, and the top for the header */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-forest-deep/85 via-forest-deep/45 to-forest-deep/5" aria-hidden />
      <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-forest-deep/60 to-transparent" aria-hidden />

      <div className="mx-auto flex min-h-[38rem] max-w-7xl items-center px-5 pt-32 pb-24 md:min-h-[42rem] md:px-8 lg:min-h-[min(100svh,48rem)] 2xl:max-w-[84rem]">
        <div className="max-w-xl">
          <p className="eyebrow fade-in flex items-center gap-4 text-ivory/85! max-sm:text-[0.64rem]!" style={delay(0)}>
            {hero.eyebrow}
            <span className="line-grow h-px w-12 origin-left bg-ivory/50" style={delay(300)} aria-hidden />
          </p>
          <h1 id="hero-title" className="mt-6 font-serif text-[clamp(2.6rem,5vw,4.5rem)] leading-[1.05] font-medium tracking-[-0.01em]">
            {lines.map((line, i) => (
              // Each line rises out of its own mask
              <span key={i} className="block overflow-hidden pb-[0.08em]">
                <span className="line-rise block" style={delay(120 + i * 140)}>
                  <Rich text={line} emClassName="text-peach" />
                </span>
              </span>
            ))}
          </h1>
          <p className="fade-up mt-6 max-w-md text-[1.05rem] leading-relaxed text-ivory/85" style={delay(120 + lines.length * 140 + 80)}>
            {hero.intro}
          </p>
          <div className="fade-up mt-9 flex flex-col gap-3 sm:flex-row" style={delay(120 + lines.length * 140 + 200)}>
            <Link href="/gallery" className={buttonClass("peach", "lg")}>
              Explore Our Work
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </Link>
            <Link href={INQUIRY_PATH} className={buttonClass("outline-light", "lg")}>
              Get a Quote
            </Link>
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <a
        href="#about-title"
        className="fade-in absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[0.62rem] font-semibold tracking-[0.3em] text-ivory/70 uppercase transition-colors hover:text-ivory md:flex"
        style={delay(1200)}
      >
        Scroll
        <span className="relative block h-10 w-px overflow-hidden bg-ivory/25" aria-hidden>
          <span className="scroll-cue absolute inset-x-0 top-0 h-1/2 bg-ivory" />
        </span>
      </a>
    </section>
  );
}
