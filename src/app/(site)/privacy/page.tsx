import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/layout/LegalPage";
import { getSiteSettings } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { mailHref, telHref } from "@/lib/utils";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata({
    title: "Privacy Policy",
    description: "How Timeless Ties Events & Decor collects, uses and protects your personal information.",
    path: "/privacy",
  });

// Describes what the site actually does: the inquiry form, hashed IPs for spam limits, first-visit attribution
// (sessionStorage), Google Analytics (production only), localStorage for the intro and offer pop-up, and the
// processors below. Update it when any of those change.
export default async function PrivacyPage() {
  const site = await getSiteSettings();
  const email = <a href={mailHref(site)}>{site.email}</a>;

  const sections: LegalSection[] = [
    {
      id: "collect",
      title: "Information we collect",
      body: (
        <>
          <p>
            <strong>Information you give us.</strong> When you send an inquiry, contact us, or book with us, we collect what you share. This includes your name,
            phone number, email, organisation, event type and date, venue, guest count, budget, the services and designs you are interested in, your preferred
            way to be contacted, inspiration links, and any message you write.
          </p>
          <p>
            <strong>Booking and payment records.</strong> For bookings, we keep your quotations, invoices, payment amounts, payment method and reference numbers,
            for example an eSewa or bank transaction ID. We do not collect or store card details.
          </p>
          <p>
            <strong>Information collected automatically.</strong> When you use the website, we record:
          </p>
          <ul>
            <li>The page you first landed on and the website or campaign that sent you there. This is saved with your inquiry.</li>
            <li>The general type of device you used, such as a phone or computer.</li>
            <li>A scrambled (hashed) version of your IP address, used only to stop spam and repeated submissions. We do not store your actual IP address.</li>
            <li>Anonymous usage statistics, collected through Google Analytics (see section 5).</li>
          </ul>
        </>
      ),
    },
    {
      id: "use",
      title: "How we use it",
      body: (
        <ul>
          <li>To reply to your inquiry, check availability and prepare your quotation.</li>
          <li>To plan, deliver and manage your event, including coordinating with our team and the vendors involved.</li>
          <li>To send you quotations, invoices, booking confirmations and payment reminders, and to keep accounting records.</li>
          <li>To understand which pages and campaigns are useful, so we can improve the website and our services.</li>
          <li>To keep the website secure and protect it from spam and misuse.</li>
        </ul>
      ),
    },
    {
      id: "share",
      title: "Who we share it with",
      body: (
        <>
          <p>
            <strong>We never sell your personal information.</strong> We share it only with:
          </p>
          <ul>
            <li>
              <strong>Service providers who run our systems:</strong> Supabase (database and secure sign-in), Vercel (website hosting), Resend (sending our
              emails) and Google (website analytics). They process information on our behalf and only for these purposes.
            </li>
            <li>
              <strong>Vendors involved in your event</strong>, such as florists, caterers or venues. They receive only what they need, such as your event date,
              venue and a contact number.
            </li>
            <li>
              <strong>Authorities</strong>, if the law requires it.
            </li>
          </ul>
          <p>
            Some of our service providers store data on servers outside Nepal. We choose providers that protect data with industry-standard security.
          </p>
        </>
      ),
    },
    {
      id: "communications",
      title: "Messages from us",
      body: (
        <p>
          We contact you about your inquiry or booking by your preferred method: phone, WhatsApp or email. Emails about quotations, bookings and payments are part of
          the service. We do not send marketing newsletters. If you would rather not hear from us again, just tell us.
        </p>
      ),
    },
    {
      id: "cookies",
      title: "Cookies and analytics",
      body: (
        <>
          <p>
            We use <strong>Google Analytics</strong> to see how many people visit, which pages they view and how they found us. It uses cookies and collects
            information such as your approximate location (city or country), browser, device and pages visited. It does not tell us who you are. You can block
            these cookies in your browser settings, or install{" "}
            <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">
              Google&rsquo;s opt-out add-on
            </a>
            .
          </p>
          <p>The website also stores a few small settings in your browser. They never leave your device:</p>
          <ul>
            <li>whether you have already seen the opening animation;</li>
            <li>whether you have closed the offer pop-up;</li>
            <li>where your current visit started, kept only until you close the tab.</li>
          </ul>
          <p>Our client portal and staff area use essential sign-in cookies to keep you logged in securely.</p>
        </>
      ),
    },
    {
      id: "retention",
      title: "How long we keep it",
      body: (
        <ul>
          <li>Inquiries that do not lead to a booking are kept for up to 2 years, in case you get in touch again, and then deleted.</li>
          <li>Booking, invoice and payment records are kept for as long as accounting and tax laws require.</li>
          <li>You can ask us to delete your information earlier (see section 8).</li>
        </ul>
      ),
    },
    {
      id: "security",
      title: "Keeping it safe",
      body: (
        <p>
          The website uses encrypted connections (HTTPS). Customer information is kept in a secure database that only authorised staff can access, with
          individual accounts and permissions. Sensitive actions are recorded in an activity log. No system is completely secure, but we take reasonable care to
          protect your information and limit who can see it.
        </p>
      ),
    },
    {
      id: "rights",
      title: "Your choices and rights",
      body: (
        <>
          <p>You can ask us at any time to:</p>
          <ul>
            <li>tell you what personal information we hold about you;</li>
            <li>correct anything that is wrong or out of date;</li>
            <li>delete your information, unless we must keep it for an active booking or for legal and accounting reasons;</li>
            <li>stop contacting you.</li>
          </ul>
          <p>
            Email {email} and we will respond within 15 days. We handle personal information in line with Nepal&rsquo;s Privacy Act, 2075 (2018).
          </p>
        </>
      ),
    },
    {
      id: "children",
      title: "Children",
      body: (
        <p>
          Our services are booked by adults. We do not knowingly collect personal information from children. Details about a child, such as a name for a birthday
          or pasni, are used only to plan that event.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Changes and contact",
      body: (
        <p>
          We may update this policy when our website or services change; the date at the top shows the latest version. Questions about your privacy? Email {email}{" "}
          or call <a href={telHref(site)}>{site.phones[0]?.label}</a>. See also our <Link href="/terms">Terms &amp; Conditions</Link>.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="Privacy Policy"
      updated="24 October 2026"
      intro={
        <p>
          Your celebration is personal, and so is the information you share with us. This policy explains what {site.name} collects when you use this website or
          book with us, why we collect it, and how you stay in control of it.
        </p>
      }
      sections={sections}
    />
  );
}
