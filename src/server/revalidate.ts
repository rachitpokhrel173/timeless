import "server-only";
import { revalidatePath, updateTag } from "next/cache";
import { CMS_TAG } from "@/lib/content";

/**
 * Push admin content changes to the live website. Call from server actions after any website
 * edit (services, gallery, business details, SEO…). The next visitor sees the change.
 */
export function refreshSite() {
  updateTag(CMS_TAG);
  revalidatePath("/", "layout");
}
