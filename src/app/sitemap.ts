import type { MetadataRoute } from "next";
import { navLinks, siteSettings } from "@/data/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // In-page anchors like "/#packages" aren't separate pages
  const pages = [...navLinks, { href: "/inquiry", label: "Inquiry" }].filter((link) => !link.href.includes("#"));
  return pages.map((link) => ({
    url: new URL(link.href, siteSettings.url).toString(),
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: link.href === "/" ? 1 : 0.8,
  }));
}
