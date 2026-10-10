import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import { getSiteSettings } from "@/lib/content";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteSettings();
  return {
  metadataBase: new URL(site.url),
  title: { default: site.title, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.name, url: site.url }],
  creator: site.name,
  publisher: site.name,
  category: "Event Planning",
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.name,
    title: site.title,
    description: site.description,
  },
  twitter: { card: "summary_large_image", title: site.title, description: site.description },
  // Indexing is allowed by default; only the preview limits are set here so pages that opt out
  // (404, privacy, terms) don't end up with a conflicting "index, follow" next to their "noindex"
  robots: { "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  formatDetection: { telephone: true, email: true, address: true },
  // Paste the codes from Google Search Console / Bing Webmaster into .env when setting them up
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
  other: {
    "geo.region": "NP-P3",
    "geo.placename": site.address.city,
    "geo.position": `${site.geo.lat};${site.geo.lng}`,
    ICBM: `${site.geo.lat}, ${site.geo.lng}`,
  },
  };
}

export const viewport: Viewport = {
  themeColor: "#f8f3ea",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: IntroCurtain's inline script may set data-intro-seen before React loads
    <html lang="en" className={`${manrope.variable} ${cormorant.variable} antialiased`} suppressHydrationWarning>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) add attributes to <body> before React loads */}
      <body className="flex min-h-dvh flex-col font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
