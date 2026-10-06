import Image from "next/image";
import type { SocialPost } from "@/lib/content";
import type { ImageAsset } from "@/types";
import { cn, socialUrl } from "@/lib/utils";
import { siteSettings } from "@/data/site";
import { FacebookIcon, InstagramIcon } from "@/components/ui/BrandIcons";
import { buttonClass } from "@/components/ui/ButtonLink";
import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

type Props = {
  /** Live posts from an Instagram/Facebook integration. */
  posts: SocialPost[];
  /** Portfolio photos used until an integration exists — never labelled as posts. */
  fallback: ImageAsset[];
};

export default function SocialFeed({ posts, fallback }: Props) {
  const instagram = socialUrl("instagram");
  const facebook = socialUrl("facebook");
  const handle = siteSettings.socials.find((s) => s.platform === "instagram")?.handle;
  if (!instagram && !facebook) return null;

  const tiles = posts.length > 0
    ? posts.slice(0, 6).map((p) => ({ key: p.id, image: p.image, href: p.url, label: p.caption ?? "View post" }))
    : fallback.slice(0, 6).map((image) => ({ key: image.src, image, href: instagram ?? facebook!, label: "See more on social media" }));

  return (
    <section aria-labelledby="social-title" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <SectionHeading
            id="social-title"
            eyebrow={handle ?? "Social"}
            title="Follow Our Latest Celebrations"
            description="Setups, details and behind-the-scenes moments from recent events."
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            {instagram && (
              <a href={instagram} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
                <InstagramIcon className="size-4" />
                Follow us on Instagram
              </a>
            )}
            {facebook && (
              <a href={facebook} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
                <FacebookIcon className="size-4" />
                See more on Facebook
              </a>
            )}
          </div>
        </Reveal>

        <ul className="mt-10 grid grid-cols-3 gap-1.5 md:mt-14 md:grid-cols-6 md:gap-3">
          {tiles.map((t, i) => (
            <li key={t.key} className={cn(i >= 3 && "hidden md:block")}>
              <a
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-square overflow-hidden rounded-md bg-cream md:rounded-lg"
              >
                <Image
                  src={t.image.src}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 16vw, 33vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ objectPosition: t.image.focus }}
                />
                <span className="absolute inset-0 flex items-center justify-center bg-ink/40 text-ivory opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden>
                  <InstagramIcon className="size-6" />
                </span>
                <span className="sr-only">{t.label} (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
