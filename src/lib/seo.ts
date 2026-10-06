import type { Metadata } from "next";
import { siteSettings as site } from "@/data/site";
import type { Service } from "@/types";
import { activeSocials } from "./utils";

/** Per-page metadata with canonical URL and matching Open Graph / X tags. */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: site.name, locale: site.locale, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

// schema.org structured data — helps Google show the business in local results and Maps.

export const localBusinessJsonLd = (services: Service[]) => ({
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": `${site.url}/#business`,
  name: site.name,
  description: site.description,
  url: site.url,
  image: `${site.url}/opengraph-image`,
  logo: `${site.url}/icon.svg`,
  email: site.email,
  telephone: site.phones[0].e164,
  address: {
    "@type": "PostalAddress",
    streetAddress: site.address.street,
    addressLocality: site.address.city,
    addressRegion: site.address.region,
    postalCode: site.address.postalCode,
    addressCountry: site.address.countryCode,
  },
  geo: { "@type": "GeoCoordinates", latitude: site.geo.lat, longitude: site.geo.lng },
  areaServed: site.areaServed.map((name) => ({ "@type": "City", name })),
  contactPoint: site.phones.map((p) => ({
    "@type": "ContactPoint",
    telephone: p.e164,
    contactType: "customer service",
    areaServed: "NP",
    availableLanguage: ["English", "Nepali"],
  })),
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Event decoration services",
    itemListElement: services.map((s) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: s.name, description: s.description },
    })),
  },
  sameAs: activeSocials().map((s) => s.url),
});

export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${site.url}/#website`,
  url: site.url,
  name: site.name,
  inLanguage: "en",
  publisher: { "@id": `${site.url}/#business` },
};

export const faqJsonLd = (items: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});

/** Serialise JSON-LD safely for a <script> tag. */
export const jsonLd = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });
