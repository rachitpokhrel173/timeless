import Image from "next/image";
import { ArrowRight, Phone } from "lucide-react";
import { INQUIRY_PATH } from "@/data/site";
import type { ImageAsset } from "@/types";
import { telHref, whatsappHref } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import ButtonLink from "@/components/ui/ButtonLink";

export default function InquiryCTA({ image }: { image: ImageAsset }) {
  return (
    <section aria-labelledby="cta-title" className="px-3 pb-3 md:px-5 md:pb-5">
      <div className="relative isolate overflow-hidden rounded-[1.75rem] px-5 py-20 text-center text-ivory md:py-32">
        <Image src={image.src} alt="" fill sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: image.focus }} />
        <div className="absolute inset-0 -z-10 bg-ink/70" aria-hidden />

        <p className="eyebrow !text-gold-light">Let&rsquo;s talk</p>
        <h2 id="cta-title" className="mx-auto mt-5 max-w-3xl font-serif text-[2.6rem] leading-[1.02] font-medium text-balance md:text-7xl">
          Let&rsquo;s Create Something <em className="font-normal text-gold-light">Beautiful.</em>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base text-ivory/80 md:text-lg">
          Tell us what you&rsquo;re planning, and let&rsquo;s start designing an event that feels uniquely yours.
        </p>

        <div className="mx-auto mt-10 grid max-w-sm gap-3 sm:max-w-none sm:grid-cols-[auto_auto_auto] sm:justify-center">
          <ButtonLink href={INQUIRY_PATH} variant="gold" size="lg">
            Send an Inquiry
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </ButtonLink>
          <ButtonLink href={telHref()} variant="outline-light" size="lg">
            <Phone className="size-4" strokeWidth={1.5} aria-hidden />
            Call Us
          </ButtonLink>
          <ButtonLink href={whatsappHref()} variant="outline-light" size="lg" external>
            <WhatsAppIcon className="size-4" />
            WhatsApp Us
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
