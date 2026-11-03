import { Fragment, type ReactNode } from "react";
import type { SocialPost } from "@/lib/content";
import { activeSocials } from "@/lib/utils";
import type { GalleryItem, HomeContent, SiteSettings, Testimonial } from "@/types";
import Hero from "./Hero";
import About from "./About";
import ServiceCards from "./ServiceCards";
import FeaturedGallery from "./FeaturedGallery";
import TimelessTouch from "./TimelessTouch";
import Packages from "./Packages";
import HowItWorks from "./HowItWorks";
import Testimonials from "./Testimonials";
import SocialSection from "./SocialSection";
import FinalCTA from "./FinalCTA";
import BeforeAfter from "./BeforeAfter";
import Stats from "./Stats";

/** The homepage sections in display order — shared by the live homepage and the draft preview. */
export default function HomeView({
  home,
  order,
  gallery,
  testimonials,
  socialPosts,
  site,
  children,
}: {
  home: HomeContent;
  /** Keys of the visible sections, top to bottom (Website CMS → Homepage). */
  order: string[];
  gallery: GalleryItem[];
  testimonials: Testimonial[];
  socialPosts: SocialPost[];
  site: SiteSettings;
  children?: ReactNode;
}) {
  // Only build sections whose content exists (a hidden section has no published content)
  const build: Record<string, () => ReactNode> = {
    hero: () => <Hero hero={home.hero} />,
    about: () => <About about={home.about} />,
    stats: () => <Stats stats={home.stats} />,
    services: () => <ServiceCards services={home.services} />,
    gallery: () => <FeaturedGallery {...home.gallery} items={gallery} />,
    transform: () => <BeforeAfter transform={home.transform} />,
    touch: () => <TimelessTouch touch={home.touch} />,
    packages: () => <Packages packages={home.packages} />,
    process: () => <HowItWorks process={home.process} />,
    testimonials: () => <Testimonials {...home.testimonials} items={testimonials} />,
    social: () => <SocialSection {...home.social} posts={socialPosts} fallback={home.social.images} socials={activeSocials(site)} />,
    cta: () => <FinalCTA cta={home.cta} />,
  };
  const keys = order.length ? order : Object.keys(build);
  return (
    <>
      {keys.map((key) => build[key] && (home as unknown as Record<string, unknown>)[key] ? <Fragment key={key}>{build[key]()}</Fragment> : null)}
      {children}
    </>
  );
}
