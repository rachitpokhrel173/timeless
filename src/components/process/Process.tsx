import { ArrowRight } from "lucide-react";
import { INQUIRY_PATH } from "@/data/site";
import { pad2 } from "@/lib/utils";
import ButtonLink from "@/components/ui/ButtonLink";
import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

export default function Process({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <section aria-labelledby="process-title" className="py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            id="process-title"
            eyebrow="How it works"
            title="From First Message to Final Toast"
            description="Planning décor shouldn't feel complicated. Here's what happens after you reach out."
          />
        </Reveal>

        <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 md:mt-16 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 110} className="border-t border-ink/15 pt-6">
              <span className="block font-serif text-6xl leading-none font-light text-gold md:text-7xl" aria-hidden>
                {pad2(i + 1)}
              </span>
              <h3 className="mt-5 font-serif text-2xl leading-tight font-medium">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-3 leading-relaxed text-muted">{step.text}</p>
            </Reveal>
          ))}
        </ol>

        <div className="mt-14 flex flex-col items-start gap-4 border-t border-ink/10 pt-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-serif text-2xl leading-snug">It all starts with a short message.</p>
          <ButtonLink href={INQUIRY_PATH} size="lg">
            Share Your Vision
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
