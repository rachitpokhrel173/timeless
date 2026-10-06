import Image from "next/image";
import { ArrowRight, MapPin } from "lucide-react";
import type { CSSProperties } from "react";
import { INQUIRY_PATH } from "@/data/site";
import type { ImageAsset } from "@/types";
import ButtonLink from "@/components/ui/ButtonLink";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

export default function Hero({ image }: { image: ImageAsset }) {
  return (
    // Pulled up under the transparent sticky header (h-16 / md:h-20); grows with its content on short screens
    <section
      aria-labelledby="hero-title"
      className="relative isolate -mt-16 flex min-h-[max(34rem,86svh)] items-end overflow-hidden bg-ink pt-28 text-ivory md:-mt-20 md:min-h-[max(40rem,calc(100svh-2.25rem))] md:pt-32"
    >
      {/* Desktop: the photo fills the right ~70% so the headline sits on solid ink beside the mandap */}
      <div className="absolute inset-0 -z-20 overflow-hidden lg:left-[30%]">
        <Image
          src={image.src}
          alt={image.alt}
          fill
          preload
          sizes="(min-width: 1024px) 70vw, 100vw"
          className="hero-image object-cover"
          style={{ objectPosition: image.focus }}
        />
      </div>
      {/* Legibility: top shade for the header, bottom/left shade for the copy. The mandap stays clear. */}
      <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-ink/60 to-transparent" aria-hidden />
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/95 via-ink/65 via-55% to-ink/25 md:to-transparent md:bg-gradient-to-r md:from-ink/80 md:via-ink/35 md:via-45% md:to-transparent md:to-70% lg:from-ink lg:from-30% lg:via-ink/55 lg:via-42% lg:to-transparent lg:to-60%"
        aria-hidden
      />
      <div className="absolute inset-x-0 bottom-0 -z-10 hidden h-1/2 bg-gradient-to-t from-ink/60 to-transparent md:block" aria-hidden />

      <div className="mx-auto w-full max-w-7xl px-5 pb-24 md:px-8 md:pb-32">
        <div className="max-w-2xl">
          <p className="fade-up flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] tracking-[0.22em] text-ivory/85 uppercase sm:text-xs" style={delay(100)}>
            <span>Wedding · Events · Celebrations</span>
            <span className="hidden h-3 w-px bg-ivory/40 sm:block" aria-hidden />
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-gold-light" strokeWidth={1.5} aria-hidden />
              Kathmandu, Nepal
            </span>
          </p>

          <h1
            id="hero-title"
            className="fade-up mt-5 font-serif text-[2.9rem] leading-[0.98] font-medium tracking-[-0.015em] text-balance sm:text-6xl lg:text-[5.25rem]"
            style={delay(200)}
          >
            Turning Your Moments Into <em className="font-normal text-gold-light">Timeless</em> Memories.
          </h1>

          <p className="fade-up mt-5 max-w-lg text-base leading-relaxed text-ivory/85 sm:text-lg" style={delay(350)}>
            Elegant wedding and event décor in Kathmandu, crafted around your vision, your celebration and your story.
          </p>

          <div className="fade-up mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" style={delay(500)}>
            <ButtonLink href={INQUIRY_PATH} variant="gold" size="lg">
              Plan Your Event
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </ButtonLink>
            <ButtonLink href="#work" variant="outline-light" size="lg">
              Explore Our Work
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
