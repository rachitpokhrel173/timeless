import type { MetadataRoute } from "next";
import { siteSettings } from "@/data/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private areas: sign-in pages, the client portal, private quotation links and API routes.
      // (They also send `X-Robots-Tag: noindex`.) /media stays crawlable for website images.
      disallow: ["/admin/", "/client/", "/quote/", "/auth/", "/api/"],
    },
    sitemap: new URL("/sitemap.xml", siteSettings.url).toString(),
  };
}
