import type { Metadata } from "next";
import Image from "next/image";
import PageHeader from "@/components/layout/PageHeader";
import InquiryCTA from "@/components/cta/InquiryCTA";
import { images } from "@/data/images";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata({
  title: "About Us",
  description: "Meet Timeless Ties Events & Decor — wedding and event decorators based in Chabahil, Kathmandu.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <PageHeader eyebrow="Our studio" title="About Us" subtitle="Wedding décor · Event styling · Celebrations" />
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:px-8 md:py-28">
        <div className="relative aspect-[4/5] overflow-hidden rounded-t-full rounded-b-2xl bg-cream">
          <Image
            src={images.coupleArchway.src}
            alt={images.coupleArchway.alt}
            fill
            sizes="(min-width: 768px) 45vw, 100vw"
            className="object-cover"
            style={{ objectPosition: images.coupleArchway.focus }}
          />
        </div>
        <div className="space-y-5 text-lg leading-relaxed text-muted">
          <h2 className="font-serif text-4xl leading-tight font-medium text-ink md:text-5xl">
            Celebrations, designed with care.
          </h2>
          <p>
            Timeless Ties Events & Decor is a Kathmandu-based décor studio. From intimate family functions to full
            wedding celebrations, we design and build the setting so you can focus on the people who matter.
          </p>
          <p>
            Every event starts with your ideas, your traditions and your budget. We turn them into a setup that feels
            personal — and we take care of it from the first sketch to the final finishing touch.
          </p>
          <p>
            Weddings and receptions, engagements, pasni and gunyo cholo, birthdays and corporate functions — whatever
            the occasion, we bring the same attention to colour, flowers, lighting and the small details your guests
            remember.
          </p>
        </div>
      </section>

      <section className="bg-ivory">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:px-8 md:py-28">
          <div className="order-2 space-y-5 text-lg leading-relaxed text-muted md:order-1">
            <h2 className="font-serif text-4xl leading-tight font-medium text-ink md:text-5xl">One team, start to finish.</h2>
            <p>
              Beyond décor, we can arrange everything around it: stage and mandap design, entrances and aisles, floral
              work, tent setup, lights, baja, DJ and sound, furniture rentals and full event management.
            </p>
            <p>
              You get one point of contact who plans the details with you, coordinates the vendors and is there on the
              day — so the setup is ready on time and exactly as agreed.
            </p>
            <p>
              Tell us your date, venue and the feel you have in mind, and we&apos;ll come back with ideas and a clear
              quotation.
            </p>
          </div>
          <div className="order-1 grid grid-cols-2 gap-4 md:order-2">
            {[images.receptionRose, images.haldiEntrance].map((img, i) => (
              <div key={img.src} className={`relative aspect-[3/4] overflow-hidden rounded-2xl bg-cream ${i === 1 ? "mt-10" : ""}`}>
                <Image src={img.src} alt={img.alt} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" style={{ objectPosition: img.focus }} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <InquiryCTA image={images.mandapBallroom} />
    </>
  );
}
