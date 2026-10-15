import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/lib/content";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const siteSettings = await getSiteSettings();
  return {
    name: siteSettings.name,
    short_name: siteSettings.shortName,
    description: siteSettings.description,
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#1c1917",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
