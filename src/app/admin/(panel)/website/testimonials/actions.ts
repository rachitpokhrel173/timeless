"use server";

import { z } from "zod";
import { db, exec, maybe, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { publicMediaIds, recordPublication } from "@/server/cms";
import { refreshSite } from "@/server/revalidate";

/*
 * Testimonials: add → review (Pending / Approved / Rejected) → publish.
 * Only approved words with the client's recorded consent can go live — the database enforces it
 * too (testimonials_publish_guard). Internal notes live in testimonial_notes, never on the public row.
 */

const testimonials = () => db.from(tbl(schema.testimonials));

async function saveNotes(testimonialId: string, notes: string | null | undefined, userId: string) {
  if (notes === undefined) return;
  await exec(db.from(tbl(schema.testimonialNotes)).upsert({ testimonial_id: testimonialId, notes: notes ?? "", updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "testimonial_id" }));
}

export const saveTestimonial = adminAction(
  "cms.manage",
  z.object({
    id: zs.optUuid(),
    customerName: zs.required("Name", 120),
    eventType: zs.required("Event", 80),
    quote: zs.required("Testimonial", 2000),
    rating: z
      .union([z.coerce.number().int().min(1).max(5), z.literal("")])
      .optional()
      .nullable()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    photoId: zs.optUuid(),
    date: zs.date(),
    customerId: zs.optUuid(),
    eventId: zs.optUuid(),
    consent: z.boolean().default(false),
    featured: z.boolean().default(false),
    position: zs.int().default(0),
    notes: zs.optional(4000),
  }),
  async ({ id, notes, ...input }, user) => {
    if (input.photoId && !(await publicMediaIds([input.photoId])).length) throw new UserError("Choose a website image for the photo.", { photoId: "Not a website image." });
    let targetId = id;
    if (id) {
      const current = await one<{ status: string; quote: string }>(testimonials().select("status,quote").eq("id", id));
      if (current.status === "PUBLISHED" && !input.consent) throw new UserError("This testimonial is on the website. Unpublish it before removing the client's consent.", { consent: "Unpublish first." });
      // Changing the words of a live review needs it to be reviewed again
      const reworded = current.quote.trim() !== input.quote.trim();
      if (reworded && current.status === "PUBLISHED") throw new UserError("This testimonial is on the website. Unpublish it before changing the client's words, then approve it again.", { quote: "Unpublish first." });
      await exec(testimonials().update(vals(schema.testimonials, { ...input, placeholder: false, ...(reworded && { reviewStatus: "PENDING" as const }) })).eq("id", id));
    } else {
      targetId = (await one<{ id: string }>(testimonials().insert(vals(schema.testimonials, { ...input, status: "DRAFT", reviewStatus: "PENDING" })).select("id"))).id;
    }
    await saveNotes(targetId!, notes, user.id);
    await audit(user, id ? "update" : "create", "testimonial", targetId!, `${id ? "Updated" : "Added"} testimonial from ${input.customerName}`);
    refreshSite();
  },
);

/** Approve, reject or send back for review. Rejecting a live testimonial takes it off the website. */
export const reviewTestimonial = adminAction("cms.manage", z.object({ id: zs.uuid(), decision: z.enum(["PENDING", "APPROVED", "REJECTED"]) }), async ({ id, decision }, user) => {
  const t = await one<{ status: string; customerName: string }>(testimonials().select("status,customerName:customer_name").eq("id", id));
  const unpublish = decision !== "APPROVED" && t.status === "PUBLISHED";
  await exec(testimonials().update({ review_status: decision, placeholder: false, ...(unpublish && { status: "DRAFT" }) }).eq("id", id));
  if (unpublish) await recordPublication("testimonial", id, "UNPUBLISH", user, `${t.customerName} (review: ${decision.toLowerCase()})`);
  await audit(user, "review", "testimonial", id, `Testimonial from ${t.customerName} → ${decision.toLowerCase()}`);
  refreshSite();
});

export const setTestimonialStatus = adminAction("cms.manage", z.object({ id: zs.uuid(), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }), async ({ id, status }, user) => {
  const t = await one<{ consent: boolean; reviewStatus: string; customerName: string }>(testimonials().select("consent,reviewStatus:review_status,customerName:customer_name").eq("id", id));
  if (status === "PUBLISHED") {
    if (t.reviewStatus !== "APPROVED") throw new UserError("Approve the testimonial before publishing it.");
    if (!t.consent) throw new UserError("Record the client's consent first (edit the testimonial).");
  }
  await exec(testimonials().update({ status, placeholder: false }).eq("id", id));
  const action = status === "PUBLISHED" ? "PUBLISH" : status === "ARCHIVED" ? "ARCHIVE" : "UNPUBLISH";
  await recordPublication("testimonial", id, action, user, t.customerName);
  await audit(user, "status", "testimonial", id, `Testimonial from ${t.customerName} → ${status.toLowerCase()}`);
  refreshSite();
});

export const saveTestimonialNotes = adminAction("cms.manage", z.object({ id: zs.uuid(), notes: zs.optional(4000) }), async ({ id, notes }, user) => {
  if (!(await maybe(testimonials().select("id").eq("id", id)))) throw new UserError("Testimonial not found.");
  await saveNotes(id, notes ?? "", user.id);
  await audit(user, "update", "testimonial", id, "Updated internal notes on a testimonial");
});
