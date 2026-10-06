import type { Metadata } from "next";
import { homeSeo } from "@/data/site";
import { getGalleryItems, getHomeContent, getSocialFeed, getTestimonials } from "@/lib/content";
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
import BeforeAfter from "@/components/home/BeforeAfter";
import Stats from "@/components/home/Stats";

export const metadata: Metadata = {
  ...pageMetadata({ title: homeSeo.title, description: homeSeo.description, path: "/" }),
  // Bypass the "%s | Site" template — the home title already contains the brand
  title: { absolute: homeSeo.title },
  keywords: homeSeo.keywords,
};

export default async function Home() {
  const [home, gallery, testimonials, socialPosts] = await Promise.all([
    getHomeContent(),
    getGalleryItems({ featured: true, limit: 3 }),
    getTestimonials(),
    getSocialFeed(),
  ]);

  return (
    <>
      <Hero hero={home.hero} />
      <About about={home.about} />
      <Stats stats={home.stats} />
      <ServiceCards services={home.services} />
      <FeaturedGallery {...home.gallery} items={gallery} />
      <BeforeAfter transform={home.transform} />
      <TimelessTouch touch={home.touch} />
      <Packages packages={home.packages} />
      <HowItWorks process={home.process} />
      <Testimonials {...home.testimonials} items={testimonials} />
      <SocialSection {...home.social} posts={socialPosts} fallback={home.social.images} socials={activeSocials()} />
      <FinalCTA cta={home.cta} />
      <OfferPopup offer={home.offer} />
    </>
  );
}
