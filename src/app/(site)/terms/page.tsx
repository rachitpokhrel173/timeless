import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/layout/LegalPage";
import { getSiteSettings } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { mailHref, telHref } from "@/lib/utils";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata({
    title: "Terms & Conditions",
    description: "Booking, payment, cancellation and event terms for Timeless Ties Events & Decor, Kathmandu.",
    path: "/terms",
  });

// Matches the quotation settings (50% advance, 14-day validity and cancellation window, setup within the valley).
// Keep the two in step when either changes; every quotation also carries its own terms.
export default async function TermsPage() {
  const site = await getSiteSettings();
  const email = (
    <a href={mailHref(site)}>{site.email}</a>
  );

  const sections: LegalSection[] = [
    {
      id: "about",
      title: "About these terms",
      body: (
        <>
          <p>
            These terms apply to every inquiry, quotation and booking with {site.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;), based in {site.address.street},{" "}
            {site.address.city}, Nepal. &ldquo;You&rdquo; means the person or organisation booking our services.
          </p>
          <p>
            Your quotation may include terms specific to your event. If anything in your quotation differs from this page, the quotation applies.
          </p>
        </>
      ),
    },
    {
      id: "quotes",
      title: "Inquiries and quotations",
      body: (
        <ul>
          <li>Sending an inquiry, message or call does not reserve a date. It starts the conversation.</li>
          <li>Every quotation is itemised and priced in Nepali rupees (NPR). Any discount or tax is shown on the quotation.</li>
          <li>
            A quotation is valid for the period shown on it, usually <strong>14 days</strong>. After that, prices and availability may change.
          </li>
          <li>Prices are based on the details you give us (date, venue, guest count, design). If these change, the price may change too.</li>
        </ul>
      ),
    },
    {
      id: "booking",
      title: "Confirming your booking",
      body: (
        <>
          <p>
            Your booking is confirmed when you accept the quotation <strong>and</strong> we receive the advance shown on it, usually{" "}
            <strong>50% of the total</strong>. Until the advance is received, the date is not held and may be offered to someone else.
          </p>
          <p>We confirm every booking in writing, by email or message, with a booking reference.</p>
        </>
      ),
    },
    {
      id: "payments",
      title: "Payments",
      body: (
        <ul>
          <li>
            The remaining balance is due <strong>on or before the event date</strong>, unless we have agreed another schedule in writing.
          </li>
          <li>We accept cash, eSewa, bank transfer and cheque. Please quote your booking or invoice number with every payment.</li>
          <li>We issue a receipt or invoice for every payment.</li>
          <li>
            If the advance or balance is not paid when due, we may pause preparation, purchasing or setup until it is paid. We will always tell you before doing so.
          </li>
          <li>Extra items or services you ask for on the day are added to your final invoice.</li>
        </ul>
      ),
    },
    {
      id: "changes",
      title: "Changes to your event",
      body: (
        <ul>
          <li>Tell us about any change (date, venue, timing, guest count or design) as early as possible, in writing.</li>
          <li>Design changes after confirmation are quoted separately and may change the total.</li>
          <li>
            <strong>Moving your date:</strong> we will do our best to move your booking. If we are available on the new date, your advance carries over. Any costs
            already spent on your event, or price differences for the new date, are added.
          </li>
          <li>
            <strong>Catering:</strong> please confirm your final guest count and menu at least 7 days before the event. We prepare for the confirmed number, and the
            confirmed number is charged.
          </li>
        </ul>
      ),
    },
    {
      id: "cancellation",
      title: "Cancellations and refunds",
      body: (
        <>
          <p>Cancellations must be made in writing (email, WhatsApp or letter). The date we receive it is the cancellation date.</p>
          <ul>
            <li>
              <strong>14 days or more before the event:</strong> we refund the advance, less any costs already incurred for your event, such as custom-made items,
              flowers or materials ordered, and vendor bookings made for you.
            </li>
            <li>
              <strong>Less than 14 days before the event:</strong> the advance is non-refundable, as materials, staff and the date have been committed to your event.
            </li>
            <li>Payments beyond the advance are refunded less costs already incurred.</li>
            <li>Approved refunds are paid within 15 working days, using the original payment method where possible.</li>
          </ul>
          <p>
            If we have to cancel for a reason within our control, we refund everything you have paid us, or, if you prefer, arrange a suitable alternative.
          </p>
        </>
      ),
    },
    {
      id: "design",
      title: "Flowers, materials and design",
      body: (
        <ul>
          <li>
            Fresh flowers are seasonal and natural. If a variety is unavailable or not at its best, we use a similar variety and keep the agreed look and colours.
          </li>
          <li>Photos on our website, catalogue and social media show past work and are a guide. Handmade and natural materials vary slightly from event to event.</li>
          <li>Colours can look different on screens and in different lighting. We are happy to show samples where possible.</li>
          <li>We may adjust a design on the day to suit the venue, safety or weather, keeping as close to the agreed design as possible.</li>
        </ul>
      ),
    },
    {
      id: "venue",
      title: "Venue, access and setup",
      body: (
        <ul>
          <li>
            Prices include setup and dismantling within the Kathmandu Valley (Kathmandu, Lalitpur and Bhaktapur). Events outside the valley may include transport,
            and where needed, accommodation for our team. These are shown on your quotation.
          </li>
          <li>
            You are responsible for venue permission, and for giving us access for the agreed setup and dismantling times, a safe working area and electricity where
            needed.
          </li>
          <li>
            If the venue delays our access or setup, or asks for decorations to be removed early, we are not responsible for the effect on the event. Extra time or
            labour this causes may be charged.
          </li>
          <li>
            For outdoor events, weather protection (such as tents or covers) is your responsibility unless it is included in your quotation.
          </li>
        </ul>
      ),
    },
    {
      id: "rentals",
      title: "Rented décor and damage",
      body: (
        <ul>
          <li>Rented décor, props, furniture, lights and fabrics remain our property and are collected after the event.</li>
          <li>
            You are responsible for loss or damage to our items caused by guests, venue staff or other vendors. This is charged at the cost of repair or
            replacement.
          </li>
          <li>Please do not move, alter or remove our installations; ask our team, who will help.</li>
        </ul>
      ),
    },
    {
      id: "vendors",
      title: "Catering and other vendors",
      body: (
        <ul>
          <li>
            <strong>Food and allergies:</strong> please tell us about allergies and dietary needs when you confirm your menu. We take care in preparation, but our
            kitchen handles common allergens, so we cannot guarantee that any dish is completely free of them.
          </li>
          <li>
            For full event management, we may book venues, photographers, music and other services on your behalf. Those suppliers&rsquo; own terms also apply, and
            we will share them with you.
          </li>
          <li>We are not responsible for services you book directly with other vendors, though we will work closely with them on the day.</li>
        </ul>
      ),
    },
    {
      id: "safety",
      title: "Safety and conduct",
      body: (
        <ul>
          <li>We may refuse or change any setup we believe is unsafe, including open flames, overloaded power or unstable structures.</li>
          <li>
            Our team is entitled to a safe and respectful workplace. We may withdraw staff from a situation that is unsafe or abusive, without liability.
          </li>
        </ul>
      ),
    },
    {
      id: "photos",
      title: "Photos and social media",
      body: (
        <p>
          We may photograph or film our décor at your event and use it on our website, catalogue and social media. We focus on the décor, not your guests. If you
          would prefer we do not share your event, tell us before the event and we will respect that.
        </p>
      ),
    },
    {
      id: "beyond-control",
      title: "Events beyond our control",
      body: (
        <p>
          We are not responsible for delays or failure to perform caused by events beyond reasonable control. These include natural disasters, earthquakes, extreme
          weather, bandh or strikes, road closures, government restrictions, epidemics, and power or supply shortages. In these cases we will work with you to move
          your event to a new date, and your advance will carry over. If that isn&rsquo;t possible, we will refund what you have paid, less costs already incurred.
        </p>
      ),
    },
    {
      id: "liability",
      title: "Our liability",
      body: (
        <p>
          We take great care with every event. If something goes wrong because of our mistake, our liability is limited to the amount you paid for the affected
          service. We are not liable for indirect losses, such as costs from other vendors or loss of enjoyment. Nothing in these terms limits liability that cannot be
          limited under the laws of Nepal.
        </p>
      ),
    },
    {
      id: "website",
      title: "Using this website",
      body: (
        <ul>
          <li>Photos, designs and text on this website belong to {site.name} and may not be copied or reused without our written permission.</li>
          <li>
            We try to keep information on this website accurate, but it may change. Your quotation is the final reference for prices and what is included.
          </li>
          <li>
            How we handle your personal information is explained in our <Link href="/privacy">Privacy Policy</Link>.
          </li>
        </ul>
      ),
    },
    {
      id: "law",
      title: "Governing law and disputes",
      body: (
        <p>
          These terms are governed by the laws of Nepal. If you have a concern, please contact us first; most issues are resolved quickly by talking. Any dispute that
          cannot be resolved will be handled by the courts of Kathmandu.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Changes and contact",
      body: (
        <p>
          We may update these terms from time to time. The version in force when you confirm your booking applies to it. Questions? Email {email} or call{" "}
          <a href={telHref(site)}>{site.phones[0]?.label}</a>.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="Terms & Conditions"
      updated="24 October 2026"
      intro={
        <p>
          Thank you for choosing {site.name}. These terms explain how inquiries, bookings, payments and cancellations work, so you know exactly what to expect from
          the first conversation to the last guest. Please read them before confirming your booking.
        </p>
      }
      sections={sections}
    />
  );
}
