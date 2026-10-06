import { siteSettings } from "@/data/site";
import type { Price, SocialLink } from "@/types";

/** Join class names, skipping falsy values. */
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export const whatsappHref = (text = siteSettings.whatsappMessage) =>
  `https://wa.me/${siteSettings.whatsapp}?text=${encodeURIComponent(text)}`;

export const telHref = (e164 = siteSettings.phones[0].e164) => `tel:${e164}`;

export const mailHref = (email = siteSettings.email) => `mailto:${email}`;

/** Social profiles that have a URL configured. */
export const activeSocials = (): SocialLink[] => siteSettings.socials.filter((s) => s.url);

export const socialUrl = (platform: SocialLink["platform"]) =>
  siteSettings.socials.find((s) => s.platform === platform && s.url)?.url;

/** Build the inquiry URL, optionally pre-selecting an event type. */
export const inquiryHref = (eventType?: string) => (eventType ? `/inquiry?event=${eventType}` : "/inquiry");

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(iso));

/** Placeholder content is shown (and labelled) in development, hidden in production. */
export const showPlaceholders = process.env.NODE_ENV !== "production";

/** "Rs 30,000", "Rs 1,500 per ft", "Rs 50,000 onwards", or "Price on request". */
export function formatPrice({ amount, unit, from }: Price) {
  if (amount === undefined) return "Price on request";
  return [`Rs ${amount.toLocaleString("en-IN")}`, unit, from && "onwards"].filter(Boolean).join(" ");
}
