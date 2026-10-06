import Image from "next/image";
import type { ImageAsset, SocialLink } from "@/types";
import type { SocialPost } from "@/lib/content";
import { socialIcons } from "@/components/ui/BrandIcons";
import Reveal from "@/components/ui/Reveal";

type Props = {
  heading: string;
  /** Live posts once a feed integration exists. Until then portfolio photos are shown and labelled as such. */
  posts: SocialPost[];
  fallback: ImageAsset[];
  /** Profiles with a configured URL, from site settings. */
  socials: SocialLink[];
};

/** Heading and handle on the left, a strip of square photos on the right. */
export default function SocialSection({ heading, posts, fallback, socials }: Props) {
  const live = posts.length > 0;
  const tiles = live ? posts.slice(0, 7).map((p) => p.image) : fallback.slice(0, 7);
  const primary = socials.find((s) => s.platform === "instagram") ?? socials[0];
  const PrimaryIcon = primary ? socialIcons[primary.platform] : null;

  return (
    <section aria-labelledby="social-title" className="bg-ivory py-16 md:py-20">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 md:px-8 lg:grid-cols-[0.75fr_2fr] lg:items-center lg:gap-12 2xl:max-w-[84rem]">
        <Reveal>
          <h2 id="social-title" className="font-serif text-[clamp(1.5rem,2.2vw,1.8rem)] leading-tight font-medium">
            {heading}
          </h2>
          {primary && PrimaryIcon && (
            <a
              href={primary.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2.5 text-[0.85rem] text-ink/75 transition-colors hover:text-ink"
            >
              <PrimaryIcon className="size-5" />
              {primary.handle ?? primary.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </Reveal>

        <div>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {tiles.map((image, i) => {
              const tile = (
                <span className="relative block aspect-square overflow-hidden rounded-[4px] bg-sand">
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes="(min-width: 1024px) 120px, (min-width: 640px) 14vw, 25vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    style={{ objectPosition: image.focus }}
                  />
                </span>
              );
              return (
                // The 4-column phone grid shows the first four only
                <Reveal as="li" key={image.src} delay={i * 70} variant="curtain" className={i >= 4 ? "max-sm:hidden" : undefined}>
                  {primary ? (
                    <a href={primary.url} target="_blank" rel="noopener noreferrer" className="group block">
                      {tile}
                      <span className="sr-only">Visit us on {primary.label} (opens in a new tab)</span>
                    </a>
                  ) : (
                    tile
                  )}
                </Reveal>
              );
            })}
          </ul>
          {!live && <p className="mt-3 text-right text-xs text-muted">Photos from our portfolio</p>}
        </div>
      </div>
    </section>
  );
}
