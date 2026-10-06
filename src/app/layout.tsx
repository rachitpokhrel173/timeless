import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import { siteSettings as site } from "@/data/site";
import { getServices } from "@/lib/content";
import { jsonLd, localBusinessJsonLd, websiteJsonLd } from "@/lib/seo";
import Navigation from "@/components/navigation/Navigation";
import SiteFooter from "@/components/footer/SiteFooter";
import QuickContact from "@/components/layout/QuickContact";
import IntroCurtain from "@/components/brand/IntroCurtain";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
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
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
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

export const viewport: Viewport = {
  themeColor: "#f8f3ea",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const services = await getServices();

  return (
    // suppressHydrationWarning: IntroCurtain's inline script may set data-intro-seen before React loads
    <html lang="en" className={`${manrope.variable} ${cormorant.variable} antialiased`} suppressHydrationWarning>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) add attributes to <body> before React loads */}
      <body className="flex min-h-dvh flex-col font-sans" suppressHydrationWarning>
        <IntroCurtain />
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd([localBusinessJsonLd(services), websiteJsonLd])} />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:bg-burgundy focus:px-5 focus:py-3 focus:text-ivory"
        >
          Skip to content
        </a>
        <Navigation />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <QuickContact />
      </body>
    </html>
  );
}
