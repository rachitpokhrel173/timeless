import type { ImageAsset, Managed } from "./common";

export type Service = Managed & {
  name: string;
  slug: string;
  /** One line for cards. */
  summary: string;
  /** Longer copy for the services page. */
  description: string;
  image: ImageAsset;
  featured: boolean;
  /* Phase 5 — shown on the service's own page (/services/<slug>) */
  category?: string;
  /** Starting price in NPR, when the business wants to show one. */
  startingPrice?: number;
  gallery?: ImageAsset[];
  includes?: { title: string; description?: string }[];
  seoTitle?: string;
  seoDescription?: string;
};

/** A decoration package as shown on its public page (/packages/<slug>). */
export type PublicPackage = {
  id: string;
  slug: string;
  name: string;
  tier: string | null;
  category: string | null;
  summary: string | null;
  description: string | null;
  price: number;
  priceFrom: boolean;
  features: string[];
  addOns: { label: string; price: number }[];
  image?: ImageAsset;
  gallery: ImageAsset[];
  services: { slug: string; name: string }[];
  seoTitle: string | null;
  seoDescription: string | null;
};

/** Occasions a visitor can plan — also the options in the inquiry form. */
export type EventTypeSlug =
  | "wedding"
  | "engagement"
  | "reception"
  | "mehendi-haldi"
  | "pasni"
  | "bratabandha"
  | "birthday"
  | "anniversary"
  | "baby-shower"
  | "corporate"
  | "private-party"
  | "other";

export type EventType = Managed & {
  slug: EventTypeSlug;
  name: string;
  /** Shown on homepage tiles. Omit to keep the type form-only. */
  image?: ImageAsset;
  showOnHome?: boolean;
};
