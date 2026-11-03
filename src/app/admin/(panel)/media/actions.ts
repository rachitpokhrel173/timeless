"use server";

import { z } from "zod";
import { db, exec, one, schema, tbl } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { mediaUsage } from "@/server/media-usage";
import { refreshSite } from "@/server/revalidate";
import { deleteStoredFile } from "@/server/storage";

export const updateMedia = adminAction(
  "cms.manage",
  z.object({
    id: zs.uuid(),
    title: zs.optional(160),
    alt: zs.text(300),
    folder: zs.text(60).default("Website"),
    tags: z
      .string()
      .max(500)
      .optional()
      .nullable()
      .transform((v) =>
        (v ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20),
      ),
  }),
  async ({ id, ...input }, user) => {
    await exec(db.from(tbl(schema.media)).update({ title: input.title, alt: input.alt, folder: input.folder || "Website", tags: input.tags }).eq("id", id));
    await audit(user, "update", "media", id, "Edited image details");
    refreshSite();
  },
);

/**
 * Delete an image that nothing uses any more — website content, drafts, staff photos, inventory,
 * share images. Use "Replace" instead to swap the picture everywhere it's used.
 */
export const deleteMedia = adminAction("cms.manage", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const usedBy = (await mediaUsage()).get(id.toLowerCase());
  if (usedBy?.length) throw new UserError(`This image is still used by ${usedBy.slice(0, 3).join(", ")}${usedBy.length > 3 ? ` and ${usedBy.length - 3} more` : ""}. Replace it there first, or use Replace to swap the picture everywhere.`);
  const m = await one<{ bucket: string; path: string; filename: string }>(db.from(tbl(schema.media)).update({ deleted_at: new Date().toISOString() }).eq("id", id).select("bucket,path,filename"));
  await deleteStoredFile(m.bucket, m.path);
  await audit(user, "delete", "media", id, `Deleted image ${m.filename}`);
  refreshSite();
});
