import { catalogueSections, priceLists } from "@/data/catalogue";
import { eventTypes } from "@/data/event-types";
import { galleryItems } from "@/data/gallery";
import { homeContent } from "@/data/home";
import { services } from "@/data/services";
import { siteSettings } from "@/data/site";
import { testimonials } from "@/data/testimonials";
import type { CatalogueSection, EventType, GalleryItem, ImageAsset, Managed, PriceList, Service, Testimonial } from "@/types";
import { showPlaceholders } from "./utils";

/*
 * Content access layer.
 *
 * Pages and components read content only through these functions. Today they return the
 * static records in /src/data; when the admin panel ships, swap the bodies for database or
 * API calls (they are already async) and nothing in the UI has to change.
 */

const visible = <T extends Managed>(items: T[]) =>
  items
    .filter((i) => i.published !== false)
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

export async function getSiteSettings() {
  return siteSettings;
}

export async function getHomeContent() {
  return homeContent;
}

export async function getServices({ featured }: { featured?: boolean } = {}): Promise<Service[]> {
  const all = visible(services);
  return featured === undefined ? all : all.filter((s) => s.featured === featured);
}

export async function getEventTypes({ home }: { home?: boolean } = {}): Promise<EventType[]> {
  const all = visible(eventTypes);
  return home ? all.filter((e) => e.showOnHome && e.image) : all;
}

export async function getGalleryItems({ featured, limit }: { featured?: boolean; limit?: number } = {}): Promise<
  GalleryItem[]
> {
  let items = visible(galleryItems);
  if (featured !== undefined) items = items.filter((g) => g.featured === featured);
  return limit ? items.slice(0, limit) : items;
}

export async function getCatalogue(): Promise<CatalogueSection[]> {
  return visible(catalogueSections).map((s) => ({ ...s, items: visible(s.items) }));
}

export async function getPriceLists(): Promise<PriceList[]> {
  return visible(priceLists);
}

/** Placeholder reviews never reach production. */
export async function getTestimonials(): Promise<Testimonial[]> {
  return visible(testimonials).filter((t) => showPlaceholders || !t.placeholder);
}

export type SocialPost = { id: string; image: ImageAsset; url: string; caption?: string };

/**
 * Latest social posts. Returns an empty list until an Instagram Graph API (or Facebook)
 * integration is added — the social section then falls back to portfolio images and
 * never presents them as live posts.
 */
export async function getSocialFeed(): Promise<SocialPost[]> {
  return [];
}
