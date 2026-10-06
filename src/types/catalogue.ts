import type { ImageAsset, Managed } from "./common";

/** A price in Nepali rupees. Omit `amount` for "price on request". */
export type Price = {
  amount?: number;
  /** e.g. "per piece", "per sq ft", "each". */
  unit?: string;
  /** Starting price — shown as "onwards". */
  from?: boolean;
};

/** A décor setup from the catalogue, shown as a photo card. */
export type CatalogueItem = Managed & {
  title: string;
  image: ImageAsset;
  price: Price;
};

export type CatalogueSection = Managed & {
  slug: string;
  name: string;
  intro: string;
  items: CatalogueItem[];
};

/** A text-only rate card (baja, tentage, rentals…). */
export type PriceList = Managed & {
  slug: string;
  name: string;
  rows: { label: string; price: Price }[];
};
