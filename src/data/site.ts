import { resolveSiteUrl } from "@/lib/site-url";
import type { NavLink, SeoSettings, SiteSettings } from "@/types";

/**
 * Business details — the single source for header, footer, contact links, SEO and structured data.
 * The future admin "Site Settings" screen edits this record.
 */
export const siteSettings: SiteSettings = {
  name: "Timeless Ties Events & Decor",
  shortName: "Timeless Ties",
  title: "Timeless Ties Events & Decor | Wedding & Event Decoration in Kathmandu",
  description:
    "Timeless Ties Events & Decor creates elegant wedding and event décor in Kathmandu, Nepal. Explore our work and plan your celebration with us.",
  tagline: "Weddings · Events · Celebrations",
  logo: { src: "/brand/logo-wine.png", alt: "Timeless Ties Events & Decor", width: 311, height: 287 },
  logoOnDark: { src: "/brand/logo-ivory.png", alt: "Timeless Ties Events & Decor", width: 311, height: 287 },
  url: resolveSiteUrl(),
  locale: "en_NP",
  email: "timelesstieseventsdecor@gmail.com",
  phones: [
    { label: "984-5411029", e164: "+9779845411029" },
    { label: "982-1896505", e164: "+9779821896505" },
  ],
  whatsapp: "9779845411029",
  whatsappMessage: "Hi Timeless Ties! I'd like to ask about décor for my event.",
  address: {
    street: "Chabahil",
    city: "Kathmandu",
    region: "Bagmati",
    postalCode: "44600",
    country: "Nepal",
    countryCode: "NP",
  },
  // Approximate centre of Chabahil — replace with the exact office pin if there is one
  geo: { lat: 27.7172, lng: 85.3461 },
  areaServed: ["Kathmandu", "Lalitpur", "Bhaktapur"],
  announcement: "Creating unforgettable moments across Kathmandu",
  socials: [
    {
      platform: "instagram",
      label: "Instagram",
      url: "https://www.instagram.com/timelesstieseventsdecor",
      handle: "@timelesstieseventsdecor",
    },
    // TODO: add the Facebook page URL — links with an empty url are hidden everywhere
    { platform: "facebook", label: "Facebook", url: "" },
    { platform: "tiktok", label: "TikTok", url: "" },
  ],
};

export const homeSeo: SeoSettings = {
  title: siteSettings.title,
  description: siteSettings.description,
  keywords: [
    "event decoration Kathmandu",
    "wedding decoration Kathmandu",
    "wedding decorator Kathmandu",
    "event decorator Nepal",
    "wedding décor Nepal",
    "birthday decoration Kathmandu",
    "event decoration Nepal",
    "mandap decoration Kathmandu",
  ],
};

export const navLinks: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/gallery", label: "Gallery" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/contact", label: "Contact" },
];

export const legalLinks: NavLink[] = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms & Conditions" },
];

/** Where every "Plan Your Event" / "Start Your Inquiry" button goes. */
export const INQUIRY_PATH = "/inquiry";
