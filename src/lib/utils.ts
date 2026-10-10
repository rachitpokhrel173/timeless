import type { Price, SiteSettings, SocialLink } from "@/types";

/** Join class names, skipping falsy values. */
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* Contact links take the business settings from the CMS (getSiteSettings / useSite). */

export const whatsappHref = (site: Pick<SiteSettings, "whatsapp" | "whatsappMessage">, text = site.whatsappMessage) =>
  `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;

export const telHref = (site: Pick<SiteSettings, "phones">, e164 = site.phones[0]?.e164 ?? "") => `tel:${e164}`;

export const mailHref = (site: Pick<SiteSettings, "email">) => `mailto:${site.email}`;

/** Social profiles that have a URL configured. */
export const activeSocials = (site: Pick<SiteSettings, "socials">): SocialLink[] => site.socials.filter((s) => s.url);

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
