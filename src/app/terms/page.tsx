import type { Metadata } from "next";
import PageHeader from "@/components/layout/PageHeader";
import { siteSettings as site } from "@/data/site";
import { mailHref } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  alternates: { canonical: "/terms" },
  // TODO: allow indexing once the client supplies their booking terms
  robots: { index: false },
};

export default function TermsPage() {
  return (
    <>
      <PageHeader title="Terms & Conditions" />
      {/* TODO: replace with the client's booking, payment and cancellation terms */}
      <section className="mx-auto max-w-3xl space-y-5 px-5 py-16 leading-relaxed text-muted md:py-20">
        <p>
          Submitting an inquiry on this website does not confirm a booking. A booking is confirmed only after we have
          sent you a quote and you have accepted it.
        </p>
        <p>
          Full booking, payment and cancellation terms are shared with every quote. For questions, email{" "}
          <a href={mailHref()} className="text-ink underline decoration-gold underline-offset-4">
            {site.email}
          </a>
          .
        </p>
      </section>
    </>
  );
}
