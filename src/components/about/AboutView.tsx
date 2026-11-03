import Image from "next/image";
import PageHeader from "@/components/layout/PageHeader";
import InquiryCTA from "@/components/cta/InquiryCTA";
import { images } from "@/data/images";
import type { AboutContent } from "@/lib/content";

/** The /about page, rendered from Website CMS → Pages → About page (also used by the draft preview). */
export default function AboutView({ about }: { about: AboutContent }) {
  const image = about.image ?? images.coupleArchway;
  const team = about.team;
  return (
    <>
      <PageHeader eyebrow={about.eyebrow || "Our studio"} title={about.title || "About Us"} subtitle={about.subtitle} />
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:px-8 md:py-28">
        <div className="relative aspect-[4/5] overflow-hidden rounded-t-full rounded-b-2xl bg-cream">
          <Image src={image.src} alt={image.alt} fill sizes="(min-width: 768px) 45vw, 100vw" className="object-cover" style={{ objectPosition: image.focus }} />
        </div>
        <div className="space-y-5 text-lg leading-relaxed text-muted">
          <h2 className="font-serif text-4xl leading-tight font-medium text-ink md:text-5xl">{about.heading}</h2>
          {(about.paragraphs ?? []).filter(Boolean).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {team && (team.heading || team.paragraphs?.length) ? (
        <section className="bg-ivory">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:px-8 md:py-28">
            <div className="order-2 space-y-5 text-lg leading-relaxed text-muted md:order-1">
              <h2 className="font-serif text-4xl leading-tight font-medium text-ink md:text-5xl">{team.heading}</h2>
              {(team.paragraphs ?? []).filter(Boolean).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className="order-1 grid grid-cols-2 gap-4 md:order-2">
              {(team.images ?? []).filter((img) => img?.src).slice(0, 2).map((img, i) => (
                <div key={`${img.src}-${i}`} className={`relative aspect-[3/4] overflow-hidden rounded-2xl bg-cream ${i === 1 ? "mt-10" : ""}`}>
                  <Image src={img.src} alt={img.alt} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" style={{ objectPosition: img.focus }} />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <InquiryCTA image={about.ctaImage?.src ? about.ctaImage : images.mandapBallroom} />
    </>
  );
}
