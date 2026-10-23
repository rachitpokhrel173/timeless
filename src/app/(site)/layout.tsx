import { getServices, getSiteSettings } from "@/lib/content";
import Attribution from "@/components/site/Attribution";
import GoogleAnalytics from "@/components/site/GoogleAnalytics";
import { SiteProvider } from "@/components/site/SiteContext";
import { jsonLd, localBusinessJsonLd, websiteJsonLd } from "@/lib/seo";
import Navigation from "@/components/navigation/Navigation";
import SiteFooter from "@/components/footer/SiteFooter";
import QuickContact from "@/components/layout/QuickContact";
import SharePage from "@/components/layout/SharePage";
import IntroCurtain from "@/components/brand/IntroCurtain";

/** Public website chrome. The admin and client portal have their own layouts. */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [services, site] = await Promise.all([getServices(), getSiteSettings()]);

  return (
    <SiteProvider value={site}>
      <GoogleAnalytics />
      <Attribution />
      <IntroCurtain />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd([localBusinessJsonLd(services, site), websiteJsonLd(site)])} />
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
      <SharePage />
      <SiteFooter />
      <QuickContact />
    </SiteProvider>
  );
}
