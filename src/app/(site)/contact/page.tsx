import type { Metadata } from "next";
import { Mail, MapPin, Phone, Plus } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import SocialLinks from "@/components/navigation/SocialLinks";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { getCatalogue, getEventTypes, getFaqs, getInquiryOptions, getSiteSettings } from "@/lib/content";
import { faqJsonLd, jsonLd, pageMetadata } from "@/lib/seo";
import { mailHref, telHref, whatsappHref } from "@/lib/utils";
import InquiryForm from "./InquiryForm";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata({
  title: "Plan Your Event",
  description:
    "Send an inquiry to Timeless Ties Events & Decor for wedding, engagement, birthday or event décor in Kathmandu. Call, WhatsApp or use the inquiry form.",
  path: "/contact",
});

export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  const [{ event, design }, eventTypes, catalogue, options, site, faqs] = await Promise.all([
    searchParams,
    getEventTypes(),
    getCatalogue(),
    getInquiryOptions(),
    getSiteSettings(),
    getFaqs(),
  ]);
  // ?design=<id> (repeatable) pre-ticks catalogue designs
  const designs = [design ?? []].flat().filter((id) => catalogue.some((s) => s.items.some((i) => i.id === id)));
  const preselected = typeof event === "string" && eventTypes.some((t) => t.slug === event) ? event : undefined;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqJsonLd(faqs))} />
      <PageHeader
        eyebrow="Inquiries"
        title="Plan Your Event"
        subtitle="Share a few details and we'll get back to you to talk through ideas and a quote."
      />

      <section id="inquiry" className="mx-auto grid max-w-7xl gap-12 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[1.7fr_1fr] lg:gap-16">
        <InquiryForm options={options} eventTypes={eventTypes} defaultEventType={preselected} catalogue={catalogue} defaultDesigns={designs} />

        <aside className="space-y-8 lg:pt-4">
          <div>
            <h2 className="font-serif text-2xl font-medium">Prefer to talk?</h2>
            <p className="mt-2 text-muted">Call or message us — whichever is easiest for you.</p>
          </div>
          <ul className="space-y-5">
            <li className="flex gap-4">
              <Phone className="mt-1 size-5 shrink-0 text-gold-deep" strokeWidth={1.5} aria-hidden />
              <div className="flex flex-col">
                {site.phones.map((p) => (
                  <a key={p.e164} href={telHref(site, p.e164)} className="py-1 text-lg hover:text-gold-deep">
                    {p.label}
                  </a>
                ))}
              </div>
            </li>
            <li className="flex gap-4">
              <WhatsAppIcon className="mt-1 size-5 shrink-0 text-gold-deep" />
              <a href={whatsappHref(site)} target="_blank" rel="noopener noreferrer" className="py-1 text-lg hover:text-gold-deep">
                Message on WhatsApp
              </a>
            </li>
            <li className="flex gap-4">
              <Mail className="mt-1 size-5 shrink-0 text-gold-deep" strokeWidth={1.5} aria-hidden />
              <a href={mailHref(site)} className="py-1 break-all hover:text-gold-deep">
                {site.email}
              </a>
            </li>
            <li className="flex gap-4">
              <MapPin className="mt-1 size-5 shrink-0 text-gold-deep" strokeWidth={1.5} aria-hidden />
              <p className="py-1">
                {site.address.street}, {site.address.city} {site.address.postalCode}, {site.address.country}
              </p>
            </li>
          </ul>
          <SocialLinks />

          <div className="border-t border-ink/10 pt-8">
            <h2 className="font-serif text-2xl font-medium">Good to know</h2>
            <div className="mt-4 border-t border-ink/10">
              {faqs.map((f) => (
                <details key={f.q} className="group border-b border-ink/10">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 font-medium">
                    {f.q}
                    <Plus className="size-4 shrink-0 text-gold-deep transition-transform group-open:rotate-45" aria-hidden />
                  </summary>
                  <p className="pb-4 leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </>
  );
}
