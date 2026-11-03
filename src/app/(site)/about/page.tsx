import type { Metadata } from "next";
import AboutView from "@/components/about/AboutView";
import { getAboutContent } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata({
    title: "About Us",
    description: "Meet Timeless Ties Events & Decor — wedding and event decorators based in Chabahil, Kathmandu.",
    path: "/about",
  });

export default async function AboutPage() {
  return <AboutView about={await getAboutContent()} />;
}
