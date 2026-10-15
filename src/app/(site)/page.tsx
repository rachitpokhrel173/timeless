import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import { homeSeo } from "@/data/site";
import { getGalleryItems, getHomeContent, getHomeSections, getSeoGlobal, getSiteSettings, getSocialFeed, getTestimonials } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { activeSocials } from "@/lib/utils";
import Hero from "@/components/home/Hero";
import About from "@/components/home/About";
import ServiceCards from "@/components/home/ServiceCards";
import FeaturedGallery from "@/components/home/FeaturedGallery";
import TimelessTouch from "@/components/home/TimelessTouch";
import Packages from "@/components/home/Packages";
import HowItWorks from "@/components/home/HowItWorks";
import Testimonials from "@/components/home/Testimonials";
import SocialSection from "@/components/home/SocialSection";
import FinalCTA from "@/components/home/FinalCTA";
import OfferPopup from "@/components/home/OfferPopup";
import { offerCoupon } from "@/server/offer";
import BeforeAfter from "@/components/home/BeforeAfter";
import Stats from "@/components/home/Stats";

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

  // Order and visibility are managed under Website → Homepage
  const sections: Record<string, ReactNode> = {
    hero: <Hero hero={home.hero} />,
    about: <About about={home.about} />,
    stats: <Stats stats={home.stats} />,
    services: <ServiceCards services={home.services} />,
    gallery: <FeaturedGallery {...home.gallery} items={gallery} />,
    transform: <BeforeAfter transform={home.transform} />,
    touch: <TimelessTouch touch={home.touch} />,
    packages: <Packages packages={home.packages} />,
    process: <HowItWorks process={home.process} />,
    testimonials: <Testimonials {...home.testimonials} items={testimonials} />,
    social: <SocialSection {...home.social} posts={socialPosts} fallback={home.social.images} socials={activeSocials(site)} />,
    cta: <FinalCTA cta={home.cta} />,
  };
  // RLS returns only published sections, already in display order
  const order = layout.length ? layout.map((s) => s.key) : Object.keys(sections);

  return (
    <>
      {order.map((key) => sections[key] && <Fragment key={key}>{sections[key]}</Fragment>)}
      {(!home.offer.couponCode || coupon) && <OfferPopup offer={home.offer} coupon={coupon} />}
    </>
  );
}
