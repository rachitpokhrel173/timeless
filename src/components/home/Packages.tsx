import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeContent } from "@/types";
import { INQUIRY_PATH } from "@/data/site";
import { buttonClass } from "@/components/ui/ButtonLink";
import Reveal from "@/components/ui/Reveal";
import SectionTitle from "@/components/ui/SectionTitle";

/** Package tiers as simple photo cards. Prices are discussed on enquiry, so none are shown. */
export default function Packages({ packages }: { packages: HomeContent["packages"] }) {
  return (
    <section id="packages" aria-labelledby="packages-title" className="bg-ivory py-16 md:py-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 md:px-8 lg:grid-cols-[0.75fr_2fr] lg:items-start lg:gap-12 2xl:max-w-[84rem]">
        <Reveal className="lg:pt-2">
          <SectionTitle id="packages-title" eyebrow={packages.eyebrow} title={packages.heading} intro={packages.intro} size="sm" />
          <Link href={INQUIRY_PATH} className={`${buttonClass("primary", "sm")} mt-7`}>
            Discuss Your Event
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </Link>
        </Reveal>

        <ul className="grid gap-4 sm:grid-cols-3 md:gap-5">
          {packages.items.map((p, i) => (
            <Reveal as="li" key={p.name} delay={i * 80}>
              <Link
                href={INQUIRY_PATH}
                className="group block h-full overflow-hidden rounded-[6px] bg-paper shadow-[0_1px_0_rgb(44_34_36/0.04),0_14px_34px_-28px_rgb(44_34_36/0.5)] transition-[transform,box-shadow] duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_26px_50px_-30px_rgb(44_34_36/0.55)]"
              >
                <Reveal variant="curtain" delay={i * 110 + 150} className="relative aspect-[16/10] overflow-hidden bg-sand">
                  <Image
                    src={p.image.src}
                    alt={p.image.alt}
                    fill
                    sizes="(min-width: 1024px) 260px, (min-width: 640px) 30vw, 100vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    style={{ objectPosition: p.image.focus }}
                  />
                </Reveal>
                <div className="px-4 py-4">
                  <h3 className="font-serif text-[1.25rem] leading-tight font-medium">{p.name}</h3>
                  <p className="mt-1 text-[0.8rem] text-muted">{p.text}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
