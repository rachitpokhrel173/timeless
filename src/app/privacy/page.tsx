import type { Metadata } from "next";
import PageHeader from "@/components/layout/PageHeader";
import { siteSettings as site } from "@/data/site";
import { mailHref } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" },
  // TODO: allow indexing once the client has reviewed the final policy
  robots: { index: false },
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader title="Privacy Policy" />
      {/* TODO: have the client review this draft before launch */}
      <section className="mx-auto max-w-3xl space-y-5 px-5 py-16 leading-relaxed text-muted md:py-20">
        <p>
          When you send an inquiry through this website we collect the details you enter — such as your name, phone
          number, email, event date, venue and event preferences — so we can reply and prepare a quote.
        </p>
        <p>
          We use this information only to respond to your inquiry and plan your event. We do not sell it or share it
          with third parties except where needed to deliver your event.
        </p>
        <p>
          To ask about or remove the information you&rsquo;ve shared, email{" "}
          <a href={mailHref()} className="text-ink underline decoration-gold underline-offset-4">
            {site.email}
          </a>
          .
        </p>
      </section>
    </>
  );
}
