import { ArrowRight, Phone } from "lucide-react";
import { INQUIRY_PATH, siteSettings } from "@/data/site";
import { telHref } from "@/lib/utils";
import ButtonLink from "@/components/ui/ButtonLink";

/** Inquiry card that overlaps the bottom edge of the hero. */
export default function QuickInquiry() {
  return (
    <section aria-labelledby="quick-inquiry-title" className="relative z-10 mx-auto -mt-12 max-w-7xl px-4 md:-mt-16 md:px-8">
      <div className="grid gap-6 rounded-2xl border border-gold/25 bg-ivory p-6 shadow-[0_24px_60px_-28px_rgb(28_25_23/0.35)] sm:p-8 md:grid-cols-[1fr_auto] md:items-center md:gap-10 md:px-12 md:py-10">
        <div className="flex gap-5 md:items-center">
          <span className="mt-1 hidden h-14 w-px shrink-0 bg-gold md:mt-0 md:block" aria-hidden />
          <div>
            <h2 id="quick-inquiry-title" className="font-serif text-[1.9rem] leading-tight font-medium md:text-4xl">
              Planning something <em className="text-gold-deep">special?</em>
            </h2>
            <p className="mt-2 max-w-xl text-muted">
              Tell us about your event and we&rsquo;ll help you bring the vision to life.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <ButtonLink href={INQUIRY_PATH} size="lg">
            Send an Inquiry
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </ButtonLink>
          <a
            href={telHref()}
            className="inline-flex h-12 items-center justify-center gap-2 text-sm font-medium tracking-wide text-ink/80 transition-colors hover:text-gold-deep sm:px-3"
          >
            <Phone className="size-4" strokeWidth={1.5} aria-hidden />
            {siteSettings.phones[0].label}
          </a>
        </div>
      </div>
    </section>
  );
}
