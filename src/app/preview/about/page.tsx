import { adminDb } from "@/db";
import { getAboutFor, type AboutContent } from "@/lib/content";
import { previewContent } from "@/server/cms";
import AboutView from "@/components/about/AboutView";

/** About page with its unpublished draft applied. */
export default async function PreviewAbout() {
  const draft = (await previewContent("setting", ["about"])).get("about") as AboutContent | undefined;
  return <AboutView about={draft ?? (await getAboutFor(adminDb))} />;
}
