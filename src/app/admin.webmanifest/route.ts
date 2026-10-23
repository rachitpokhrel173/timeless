import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/lib/content";

// The admin panel installs as its own app, separate from the public site's /manifest.webmanifest.
// Served outside /admin/ so the proxy's sign-in gate doesn't block the browser from fetching it.
export async function GET() {
  const site = await getSiteSettings();
  const manifest: MetadataRoute.Manifest = {
    id: "/admin",
    name: `${site.shortName} Admin`,
    short_name: "TT Admin",
    description: `Bookings, customers and invoices for ${site.name}.`,
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f3ec",
    theme_color: "#f7f3ec",
    categories: ["business", "productivity"],
    icons: [
      { src: "/admin-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/admin-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/admin-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Bookings", url: "/admin/bookings" },
      { name: "Inquiries", url: "/admin/inquiries" },
      { name: "Calendar", url: "/admin/calendar" },
    ],
  };
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
