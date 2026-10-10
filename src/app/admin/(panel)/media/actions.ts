"use server";

import { z } from "zod";
import { db, exec, many, maybe, one, schema, tbl } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
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

/** Delete an image that nothing on the website uses any more. */
export const deleteMedia = adminAction("cms.manage", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const usage = await Promise.all([
    maybe(db.from(tbl(schema.galleryItems)).select("id").eq("media_id", id).limit(1)),
    maybe(db.from(tbl(schema.galleryAlbums)).select("id").or(`cover_id.eq.${id},before_id.eq.${id},after_id.eq.${id}`).limit(1)),
    maybe(db.from(tbl(schema.services)).select("id").eq("image_id", id).limit(1)),
    maybe(db.from(tbl(schema.packages)).select("id").eq("image_id", id).limit(1)),
    maybe(db.from(tbl(schema.testimonials)).select("id").eq("photo_id", id).limit(1)),
    maybe(db.from(tbl(schema.catalogueItems)).select("id").eq("image_id", id).limit(1)),
  ]);
  // Section and page content is JSON — look for the id anywhere inside it
  const [sections, settings] = await Promise.all([
    many<{ content: unknown }>(db.from(tbl(schema.homepageSections)).select("content")),
    many<{ value: unknown }>(db.from(tbl(schema.siteSettings)).select("value").eq("is_public", true)),
  ]);
  const inContent = [...sections.map((s) => s.content), ...settings.map((s) => s.value)].some((v) => JSON.stringify(v).includes(id));
  if (usage.some(Boolean) || inContent) throw new UserError("This image is used on the website (a page section, album, service, package or testimonial). Replace it there first.");
  const m = await one<{ bucket: string; path: string; filename: string }>(db.from(tbl(schema.media)).update({ deleted_at: new Date().toISOString() }).eq("id", id).select("bucket,path,filename"));
  await deleteStoredFile(m.bucket, m.path);
  await audit(user, "delete", "media", id, `Deleted image ${m.filename}`);
  refreshSite();
});
