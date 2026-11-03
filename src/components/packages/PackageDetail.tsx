import Image from "next/image";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import InquiryCTA from "@/components/cta/InquiryCTA";
import { images } from "@/data/images";
import { formatPrice, inquiryHref } from "@/lib/utils";
import type { PublicPackage } from "@/types";

/** A decoration package's own page (/packages/<slug>) — also rendered by the draft preview. */
export default function PackageDetail({ pkg }: { pkg: PublicPackage }) {
  const gallery = pkg.gallery.filter((g) => g.src !== pkg.image?.src);
  return (
    <>
      <PageHeader eyebrow={pkg.tier || pkg.category || "Package"} title={pkg.name} subtitle={pkg.summary ?? undefined} />
      <section className="mx-auto grid max-w-7xl items-start gap-10 px-5 py-16 md:grid-cols-2 md:gap-16 md:px-8 md:py-24">
        {pkg.image && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-cream">
            <Image src={pkg.image.src} alt={pkg.image.alt} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" style={{ objectPosition: pkg.image.focus }} />
          </div>
        )}
        <div>
          {pkg.price > 0 && <p className="font-serif text-3xl text-ink">{formatPrice({ amount: pkg.price, from: pkg.priceFrom })}</p>}
          {pkg.description && <p className="mt-5 text-lg leading-relaxed whitespace-pre-line text-muted">{pkg.description}</p>}
          {pkg.features.length > 0 && (
            <div className="mt-8">
              <h2 className="font-serif text-2xl font-medium">What&rsquo;s included</h2>
              <ul className="mt-4 space-y-2.5">
                {pkg.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <Check className="mt-1 size-4 shrink-0 text-gold-deep" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pkg.addOns.length > 0 && (
            <div className="mt-8">
              <h2 className="font-serif text-2xl font-medium">Optional add-ons</h2>
              <ul className="mt-4 space-y-2.5">
                {pkg.addOns.map((a) => (
                  <li key={a.label} className="flex gap-3">
                    <Plus className="mt-1 size-4 shrink-0 text-gold-deep" aria-hidden />
                    <span>
                      {a.label}
                      {a.price > 0 && <span className="text-muted"> — {formatPrice({ amount: a.price })}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pkg.services.length > 0 && (
            <p className="mt-8 text-sm text-muted">
              Covers:{" "}
              {pkg.services.map((s, i) => (
                <span key={s.slug}>
                  {i > 0 && ", "}
                  <Link href={`/services/${s.slug}`} className="underline underline-offset-2 hover:text-gold-deep">
                    {s.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
          <Link href={`${inquiryHref()}#inquiry`} className="mt-10 inline-flex items-center rounded-full bg-burgundy px-6 py-3 text-sm font-medium tracking-wide text-ivory hover:bg-burgundy/90">
            Ask about the {pkg.name} package
          </Link>
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
      <InquiryCTA image={pkg.image ?? images.mandapBallroom} />
    </>
  );
}
