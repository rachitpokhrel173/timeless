import type { MetadataRoute } from "next";
import { siteSettings } from "@/data/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", siteSettings.url).toString(),
  };
}
