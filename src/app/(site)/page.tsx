import type { Metadata } from "next";
import { homeSeo } from "@/data/site";
import { getGalleryItems, getHomeContent, getHomeSections, getSeoGlobal, getSiteSettings, getSocialFeed, getTestimonials } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import HomeView from "@/components/home/HomeView";
import OfferPopup from "@/components/home/OfferPopup";
import { offerCoupon } from "@/server/offer";

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoGlobal();
  const meta = await pageMetadata({
    title: seo?.homeTitle || homeSeo.title,
    description: seo?.homeDescription || homeSeo.description,
    path: "/",
    // The home title already contains the brand, so it skips the "%s | Site" template
    absoluteTitle: true,
  });
  return { ...meta, keywords: seo?.keywords ?? homeSeo.keywords };
}

export default async function Home() {
  const [home, gallery, testimonials, socialPosts, site, layout] = await Promise.all([
    getHomeContent(),
    getGalleryItems({ featured: true, limit: 3 }),
    getTestimonials(),
    getSocialFeed(),
    getSiteSettings(),
    getHomeSections(),
  ]);

  // An offer tied to a coupon disappears once the coupon can't be claimed any more
  const coupon = home.offer.enabled && home.offer.couponCode ? await offerCoupon(home.offer.couponCode) : null;

  // Order and visibility are managed under Website CMS → Homepage (RLS returns published sections only)
  return (
    <HomeView home={home} order={layout.map((s) => s.key)} gallery={gallery} testimonials={testimonials} socialPosts={socialPosts} site={site}>
      {(!home.offer.couponCode || coupon) && <OfferPopup offer={home.offer} coupon={coupon} />}
    </HomeView>
  );
}
