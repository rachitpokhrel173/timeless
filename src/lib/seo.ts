import type { Metadata } from "next";
import { siteSettings as defaults } from "@/data/site";
import type { ImageAsset, Service, SiteSettings } from "@/types";
import { getPageSeo, getSiteSettings } from "./content";
import { activeSocials } from "./utils";

/**
 * The branded card from app/opengraph-image.tsx. Pages that set their own `openGraph`
 * replace the inherited one entirely, so the image has to be passed again explicitly.
 */
const defaultShareImage = (site: SiteSettings) => ({
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${site.name} — Wedding & Event Decoration in Kathmandu`,
});

/**
 * Per-page metadata with canonical URL and matching Open Graph / X tags. The page supplies
 * defaults; anything set under Marketing → SEO in the admin overrides them.
 */
export async function pageMetadata({
  title: defaultTitle,
  description: defaultDescription,
  path,
  image: defaultImage,
  absoluteTitle,
}: {
  title: string;
  description: string;
  path: string;
  /** Share preview for this page. Defaults to the branded site card. */
  image?: ImageAsset;
  /** Skip the "%s | Site" template (the home page title already contains the brand). */
  absoluteTitle?: boolean;
}): Promise<Metadata> {
  const [site, override] = await Promise.all([getSiteSettings(), getPageSeo(path)]);
  const title = override?.title || defaultTitle;
  const description = override?.description || defaultDescription;
  const image = override?.image ?? defaultImage;
  // <title> gets the brand from the layout template; share cards need it spelled out
  const shareTitle = title.includes(site.shortName) ? title : `${title} | ${site.shortName}`;
  const shareImage = image ? { url: image.src, width: image.width, height: image.height, alt: image.alt } : defaultShareImage(site);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    ...(override?.noindex && { robots: { index: false, follow: true } }),
    alternates: { canonical: path },
    openGraph: {
      title: shareTitle,
      description,
      url: path,
      siteName: site.name,
      locale: site.locale,
      type: "website",
      images: [shareImage],
    },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: [shareImage] },
  };
}

// schema.org structured data — helps Google show the business in local results and Maps.

const absolute = (path: string) => new URL(path, defaults.url).toString();

export const localBusinessJsonLd = (services: Service[], site: SiteSettings) => ({
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": `${site.url}/#business`,
  name: site.name,
  description: site.description,
  url: site.url,
  // Google wants real photos of the business here, and a raster (not SVG) logo
  image: [absolute("/opengraph-image"), ...services.slice(0, 4).map((s) => absolute(s.image.src))],
  logo: absolute(site.logo?.src ?? "/apple-icon.png"),
  hasMap: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${site.name}, ${site.address.street}, ${site.address.city}`,
  )}`,
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
  sameAs: activeSocials(site).map((s) => s.url),
});

export const websiteJsonLd = (site: SiteSettings) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${site.url}/#website`,
  url: site.url,
  name: site.name,
  inLanguage: "en",
  publisher: { "@id": `${site.url}/#business` },
});

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
