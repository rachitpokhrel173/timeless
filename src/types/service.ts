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
