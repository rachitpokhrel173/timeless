import { Flower2, MessageCircleHeart, PartyPopper, PenTool, type LucideIcon } from "lucide-react";
import type { HomeContent, ProcessIcon } from "@/types";
import Reveal from "@/components/ui/Reveal";
import SectionTitle from "@/components/ui/SectionTitle";
import { pad2 } from "@/lib/utils";

const ICONS: Record<ProcessIcon, LucideIcon> = { vision: MessageCircleHeart, design: PenTool, details: Flower2, celebrate: PartyPopper };

/** Title on the left, four numbered steps in a row divided by hairlines. */
export default function HowItWorks({ process }: { process: HomeContent["process"] }) {
  return (
    <section aria-labelledby="process-title" className="bg-sand py-14 md:py-16">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 md:px-8 lg:grid-cols-[0.75fr_2fr] lg:items-center lg:gap-12 2xl:max-w-[84rem]">
        <Reveal>
          <SectionTitle id="process-title" eyebrow={process.eyebrow} title={process.heading} size="sm" />
        </Reveal>

        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
          {process.steps.map((step, i) => {
            const Icon = ICONS[step.icon];
            return (
              <Reveal as="li" key={step.title} delay={i * 90} className="group grid grid-cols-[2rem_1fr] gap-3 lg:border-l lg:border-ink/15 lg:px-6 lg:first:border-l-0 lg:first:pl-0">
                <span className="pt-0.5 font-serif text-[0.95rem] text-muted">{pad2(i + 1)}</span>
                <div>
                  <Icon className="size-6 text-gold-deep transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:rotate-[-8deg]" strokeWidth={1.3} aria-hidden />
                  <h3 className="mt-3 font-serif text-[1.1rem] leading-tight font-medium">{step.title}</h3>
                  <p className="mt-1.5 text-[0.82rem] leading-relaxed text-muted">{step.text}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
