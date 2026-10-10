import type { ImageAsset, ISODate, Managed } from "./common";

/** "other" is kept for older albums; it shows under "Corporate & others". */
export type GalleryCategory = "weddings" | "engagements" | "pasni" | "birthdays" | "corporate" | "other";

export type GalleryItem = Managed & {
  title: string;
  category: GalleryCategory;
  /** Venue or area, e.g. "Hotel Yak & Yeti, Kathmandu". Only set for real events. */
  location?: string;
  /** Only set for real events. */
  date?: ISODate;
  /** Cover image shown in the grid. */
  image: ImageAsset;
  /** Additional photos from the same event, shown in the lightbox after the cover. */
  images?: ImageAsset[];
  featured: boolean;
};
