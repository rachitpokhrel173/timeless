import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeContent } from "@/types";
import { INQUIRY_PATH } from "@/data/site";
import { buttonClass } from "@/components/ui/ButtonLink";
import Reveal from "@/components/ui/Reveal";
import Rich from "@/components/ui/Rich";

/** Short band over a darkened photo, leading into the footer. */
export default function FinalCTA({ cta }: { cta: HomeContent["cta"] }) {
  return (
    <section aria-labelledby="cta-title" className="relative isolate overflow-hidden bg-forest-deep px-5 py-14 text-center text-ivory md:px-8 md:py-16">
      <Image src={cta.image.src} alt="" fill sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: cta.image.focus }} />
      <div className="absolute inset-0 -z-10 bg-forest-deep/75" aria-hidden />

      <Reveal className="mx-auto max-w-xl">
        <h2 id="cta-title" className="font-serif text-[clamp(1.8rem,3vw,2.4rem)] leading-tight font-medium">
          <Rich text={cta.heading} emClassName="text-peach" />
        </h2>
        <p className="mt-3 text-[0.95rem] text-ivory/80">{cta.body}</p>
        <Link href={INQUIRY_PATH} className={`${buttonClass("peach", "sm")} mt-7`}>
          Start Your Inquiry
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
        </Link>
      </Reveal>
    </section>
  );
}
