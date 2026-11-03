import { adminDb } from "@/db";
import { buildHomeContent, buildSiteSettings, getGalleryItems, getSocialFeed, getTestimonials, homeSectionOrder, type BusinessSettings } from "@/lib/content";
import { previewContent } from "@/server/cms";
import HomeView from "@/components/home/HomeView";

/** Homepage with every unpublished section draft applied. */
export default async function PreviewHome() {
  const [sections, settings] = await Promise.all([previewContent("section"), previewContent("setting", ["business"])]);
  const [home, order, gallery, testimonials, socialPosts, site] = await Promise.all([
    buildHomeContent(adminDb, sections),
    homeSectionOrder(adminDb),
    getGalleryItems({ featured: true, limit: 3 }),
    getTestimonials(),
    getSocialFeed(),
    buildSiteSettings(adminDb, settings.get("business") as Partial<BusinessSettings> | undefined),
  ]);
  return <HomeView home={home} order={order.map((s) => s.key)} gallery={gallery} testimonials={testimonials} socialPosts={socialPosts} site={site} />;
}
