import type { ImageAsset } from "./common";

export type NavLink = { href: string; label: string };

export type PhoneNumber = {
  /** Display format, e.g. "984-5411029". */
  label: string;
  /** E.164, e.g. "+9779845411029". */
  e164: string;
};

export type SocialPlatform = "instagram" | "facebook" | "tiktok";

export type SocialLink = {
  platform: SocialPlatform;
  label: string;
  /** Leave empty until the real profile URL is known — empty links are not rendered. */
  url: string;
  handle?: string;
};

export type SiteSettings = {
  name: string;
  shortName: string;
  /** Used in <title> and share cards. */
  title: string;
  description: string;
  /** Short line used in small editorial labels. */
  tagline: string;
  /** Uploaded logo. When unset, the typeset wordmark is rendered instead. */
  logo?: ImageAsset;
  /** Light version of the logo for dark backgrounds (hero, footer). Falls back to `logo`. */
  logoOnDark?: ImageAsset;
  url: string;
  locale: string;
  email: string;
  phones: PhoneNumber[];
  /** International format without "+", used for wa.me links. */
  whatsapp: string;
  whatsappMessage: string;
  address: {
    street: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    countryCode: string;
  };
  geo: { lat: number; lng: number };
  areaServed: string[];
  announcement: string;
  socials: SocialLink[];
};

export type SeoSettings = {
  title: string;
  description: string;
  keywords: string[];
  ogImage?: string;
};
