import type { Metadata } from "next";
import Botanical from "@/components/brand/Botanical";
import { siteSettings as site } from "@/data/site";
import { getCatalogue, getEventTypes } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { telHref, whatsappHref } from "@/lib/utils";
import InquiryForm from "../contact/InquiryForm";

export const metadata: Metadata = pageMetadata({
  title: "Start Your Inquiry",
  description:
    "Tell Timeless Ties Events & Decor about your wedding or celebration in Kathmandu — date, venue, guests and the ideas you love — and we'll be in touch.",
  path: "/inquiry",
});

export default async function InquiryPage({ searchParams }: PageProps<"/inquiry">) {
  const [{ event, design }, eventTypes, catalogue] = await Promise.all([searchParams, getEventTypes(), getCatalogue()]);
  // ?design=<id> (repeatable) pre-ticks catalogue designs
  const designs = [design ?? []].flat().filter((id) => catalogue.some((s) => s.items.some((i) => i.id === id)));
  const preselected = typeof event === "string" && eventTypes.some((t) => t.slug === event) ? event : undefined;

  return (
    <div className="bg-ivory">
      <section className="relative mx-auto max-w-5xl overflow-hidden px-5 pt-12 pb-10 text-center md:px-8 md:pt-20 md:pb-14">
        <Botanical variant="sprig" className="mx-auto mb-6 h-12 w-auto rotate-[8deg] text-burgundy/40" strokeWidth={1.4} />
        <p className="eyebrow">Start your inquiry</p>
        <h1 className="mt-4 font-serif text-[clamp(2.6rem,5vw,4.4rem)] leading-[1.06] font-medium">
          Tell us about <em className="text-burgundy italic">your celebration.</em>
        </h1>
        <p className="mx-auto mt-6 max-w-lg leading-relaxed text-muted">
          Share as much or as little as you know. We&apos;ll come back to you to talk through ideas and a quote — or reach us
          directly on{" "}
          <a href={whatsappHref()} target="_blank" rel="noopener noreferrer" className="font-medium text-burgundy underline-offset-4 hover:underline">
            WhatsApp
          </a>{" "}
          or{" "}
          <a href={telHref()} className="font-medium text-burgundy underline-offset-4 hover:underline">
            {site.phones[0].label}
          </a>
          .
        </p>
      </section>

      <section id="inquiry" className="mx-auto max-w-5xl px-4 pb-24 md:px-8 md:pb-36">
        <InquiryForm eventTypes={eventTypes} defaultEventType={preselected} catalogue={catalogue} defaultDesigns={designs} />
      </section>
    </div>
  );
}
