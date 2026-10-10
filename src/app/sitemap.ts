import type { MetadataRoute } from "next";
import { navLinks, siteSettings } from "@/data/site";
import { getCatalogue, getGalleryItems, getHomeContent, getServices } from "@/lib/content";

const absolute = (path: string) => new URL(path, siteSettings.url).toString();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [home, services, gallery, catalogue] = await Promise.all([
    getHomeContent(),
    getServices(),
    getGalleryItems(),
    getCatalogue(),
  ]);

  // Image entries help the portfolio and catalogue photos show up in Google Images
  const images: Record<string, string[]> = {
    "/": [home.hero.image.src, ...gallery.filter((g) => g.featured).map((g) => g.image.src)],
    "/services": services.map((s) => s.image.src),
    "/gallery": gallery.flatMap((g) => [g.image, ...(g.images ?? [])].map((i) => i.src)),
    "/catalogue": catalogue.flatMap((s) => s.items.map((i) => i.image.src)),
  };

  // In-page anchors like "/#packages" aren't separate pages. No lastModified: a build timestamp
  // on every URL is inaccurate, and Google stops trusting lastmod values that are.
  const pages = [...navLinks, { href: "/inquiry", label: "Inquiry" }].filter((link) => !link.href.includes("#"));
  return pages.map((link) => ({
    url: absolute(link.href),
    images: [...new Set(images[link.href] ?? [])].map(absolute),
  }));
}
