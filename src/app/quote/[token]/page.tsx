import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { after } from "next/server";
import { getSiteSettings } from "@/lib/content";
import { fmtDateLong, npr } from "@/lib/format";
import { clientIp, clientUserAgent, hashIp } from "@/lib/request";
import { quoteDocProps, quoteImages } from "@/server/documents";
import { recordQuoteView } from "@/server/quote-views";
import { publicQuote, quoteAcceptance } from "@/server/sales";
import { BusinessDocument } from "@/components/documents/BusinessDocument";
import PrintButton from "@/components/documents/PrintButton";
import QuoteResponse from "./QuoteResponse";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your quotation", robots: { index: false, follow: false } };

/** The client's private quotation page (capability link from the "send" email / WhatsApp). */
export default async function PublicQuotePage({ params }: PageProps<"/quote/[token]">) {
  const { token } = await params;
  const quote = await publicQuote(token);
  if (!quote) notFound();
  const [brand, images] = await Promise.all([getSiteSettings(), quoteImages(quote.referenceMediaIds)]);
  const [ip, ua] = await Promise.all([clientIp(), clientUserAgent()]);
  after(() => recordQuoteView(token, hashIp(ip), ua).catch((e) => console.error("[quote view]", e)));

  const accepted = quoteAcceptance(quote);
  const open = ["SENT", "VIEWED"].includes(quote.status) && !quote.expired;
  const stamp =
    quote.status === "ACCEPTED" ? (
      <p className="mt-1 inline-block rounded border border-emerald-600 px-2 py-0.5 text-xs font-semibold tracking-wider text-emerald-700 uppercase">Accepted {quote.acceptedAt ? fmtDateLong(quote.acceptedAt) : ""}</p>
    ) : quote.expired ? (
      <p className="mt-1 inline-block rounded border border-neutral-400 px-2 py-0.5 text-xs font-semibold tracking-wider text-neutral-600 uppercase">Expired</p>
    ) : null;

  return (
    <main className="min-h-dvh bg-[#f8f3ea] py-6 sm:py-10 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <p className="text-sm text-neutral-600">
          Hi {quote.customerName.split(" ")[0]}, here is your quotation from {brand.shortName}.
        </p>
        <PrintButton label="Download PDF" />
      </div>
      <div className="shadow-sm print:shadow-none">
        <BusinessDocument {...quoteDocProps(brand, quote, { name: quote.customerName, phone: quote.customerPhone, email: quote.customerEmail }, quote.items)} images={images} stamp={stamp} />
      </div>

      {quote.status === "ACCEPTED" ? (
        <section className="mx-auto mt-6 max-w-[820px] px-4 print:hidden">
          <div role="status" className="flex gap-3 rounded-xl border border-emerald-700/60 bg-emerald-50 p-5 text-emerald-900">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold">Quotation accepted</h2>
              <p className="mt-0.5">
                Accepted{accepted?.online && accepted.name ? ` by ${accepted.name}` : ""}
                {accepted ? ` on ${fmtDateLong(accepted.at)}` : ""}. Thank you! {brand.shortName} will be in touch about the advance payment to confirm your booking.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="mx-auto mt-6 max-w-[820px] px-4 print:hidden" aria-labelledby="respond">
          <div className="rounded-lg border border-neutral-200 bg-white p-6">
            <h2 id="respond" className="font-serif text-2xl font-semibold text-[#5a1f2b]">
              {open ? "Ready to go ahead?" : "This quotation is closed"}
            </h2>
            {open ? (
              <>
                <p className="mt-1 mb-5 text-sm text-neutral-600">
                  Accept to reserve your date{quote.depositAmount ? ` — a ${npr(quote.depositAmount)} advance confirms the booking` : ""}. Valid until {quote.validUntil ? fmtDateLong(quote.validUntil) : "further notice"}.
                </p>
                <QuoteResponse token={token} deposit={quote.depositAmount ? npr(quote.depositAmount) : null} />
              </>
            ) : (
              <p className="mt-1 text-sm text-neutral-600">
                {quote.expired
                  ? "The validity date has passed. Please contact us for an updated quotation."
                  : `This quotation was ${quote.status.toLowerCase()}. Contact us if you'd like to revisit it.`}{" "}
                {brand.phones[0] && (
                  <a className="font-medium text-[#5a1f2b] underline" href={`tel:${brand.phones[0].e164}`}>
                    {brand.phones[0].label}
                  </a>
                )}
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
