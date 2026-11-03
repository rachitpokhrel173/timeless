import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import InquiryCTA from "@/components/cta/InquiryCTA";
import { formatPrice, inquiryHref } from "@/lib/utils";
import type { Service } from "@/types";

/** A service's own page (/services/<slug>) — also rendered by the draft preview. */
export default function ServiceDetail({ service }: { service: Service }) {
  const gallery = (service.gallery ?? []).filter((g) => g.src !== service.image.src);
  return (
    <>
      <PageHeader eyebrow={service.category || "Our services"} title={service.name} subtitle={service.summary} />
      <section className="mx-auto grid max-w-7xl items-start gap-10 px-5 py-16 md:grid-cols-2 md:gap-16 md:px-8 md:py-24">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-cream">
          <Image src={service.image.src} alt={service.image.alt} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" style={{ objectPosition: service.image.focus }} />
        </div>
        <div>
          <p className="text-lg leading-relaxed whitespace-pre-line text-muted">{service.description}</p>
          {service.startingPrice ? <p className="mt-6 font-serif text-2xl text-ink">{formatPrice({ amount: service.startingPrice, from: true })}</p> : null}
          {service.includes?.length ? (
            <div className="mt-8">
              <h2 className="font-serif text-2xl font-medium">What&rsquo;s included</h2>
              <ul className="mt-4 space-y-3">
                {service.includes.map((i) => (
                  <li key={i.title} className="flex gap-3">
                    <Check className="mt-1 size-4 shrink-0 text-gold-deep" aria-hidden />
                    <span>
                      {i.title}
                      {i.description && <span className="block text-sm text-muted">{i.description}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link href={`${inquiryHref()}#inquiry`} className="inline-flex items-center rounded-full bg-burgundy px-6 py-3 text-sm font-medium tracking-wide text-ivory hover:bg-burgundy/90">
              Ask about {service.name.toLowerCase()}
            </Link>
            <Link href="/services" className="inline-flex items-center gap-2 text-sm text-muted hover:text-gold-deep">
              <ArrowLeft className="size-4" aria-hidden /> All services
            </Link>
          </div>
        </div>
      </section>
      {gallery.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 pb-20 md:px-8">
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
            {gallery.map((g, i) => (
              <li key={`${g.src}-${i}`} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-cream">
                <Image src={g.src} alt={g.alt} fill sizes="(min-width: 768px) 33vw, 50vw" className="object-cover" style={{ objectPosition: g.focus }} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <InquiryCTA image={service.image} />
    </>
  );
}
