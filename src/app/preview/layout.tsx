import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { buildSiteSettings, navigationFor, type BusinessSettings, type NavigationContent } from "@/lib/content";
import { previewContent } from "@/server/cms";
import Navigation from "@/components/navigation/Navigation";
import SiteFooter from "@/components/footer/SiteFooter";
import { SiteProvider } from "@/components/site/SiteContext";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Preview — unpublished changes" }, robots: { index: false, follow: false } };

/**
 * Draft preview: the public site chrome with unpublished Website CMS changes laid over the live
 * content. Signed-in website editors only (the proxy also requires a session and sends noindex).
 */
export default async function PreviewLayout({ children }: LayoutProps<"/preview">) {
  const user = await getCurrentUser();
  if (!user?.isStaff || !(user.permissions.has("cms.view") || user.permissions.has("cms.manage"))) notFound();
  const drafts = await previewContent("setting", ["business", "navigation"]);
  const [site, nav] = await Promise.all([
    buildSiteSettings(adminDb, drafts.get("business") as Partial<BusinessSettings> | undefined),
    navigationFor(adminDb, drafts.get("navigation") as Partial<NavigationContent> | undefined),
  ]);
  return (
    <SiteProvider value={site}>
      <div role="status" className="sticky top-0 z-[80] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-ink px-4 py-2 text-center text-[0.8rem] text-ivory">
        <span>
          <strong className="font-semibold">Preview</strong> — unpublished changes. Visitors still see the live website.
        </span>
        <Link href="/admin/website" className="underline underline-offset-2 hover:text-gold">
          Back to Website CMS
        </Link>
      </div>
      <Navigation links={nav.links} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter site={site} nav={nav} />
    </SiteProvider>
  );
}
