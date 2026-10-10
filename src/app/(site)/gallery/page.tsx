import type { Metadata } from "next";
import PageHeader from "@/components/layout/PageHeader";
import Gallery from "@/components/gallery/Gallery";
import InquiryCTA from "@/components/cta/InquiryCTA";
import SocialLinks from "@/components/navigation/SocialLinks";
import { galleryCategories } from "@/data/gallery";
import { images } from "@/data/images";
import { getGalleryItems } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata({
  title: "Gallery",
  description: "Wedding, engagement, birthday and event décor by Timeless Ties Events & Decor in Kathmandu, Nepal.",
  path: "/gallery",
});

export default async function GalleryPage() {
  const items = await getGalleryItems();

  return (
    <>
      <PageHeader
        eyebrow="Our work"
        title="Gallery"
        subtitle="Mandaps, stages, entrances and the small details in between."
      />
      <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
        <Gallery items={items} categories={galleryCategories} />
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <p className="text-muted">See more of our latest work on social media</p>
          <SocialLinks />
        </div>
      </section>
      <InquiryCTA image={images.receptionRose} />
    </>
  );
}
