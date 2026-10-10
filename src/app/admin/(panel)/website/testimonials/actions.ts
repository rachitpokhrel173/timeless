"use server";

import { z } from "zod";
import { db, exec, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { refreshSite } from "@/server/revalidate";

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
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
    position: zs.int().default(0),
  }),
  async ({ id, ...input }, user) => {
    // Only real, consented words go on the live site
    if (input.status === "PUBLISHED" && !input.consent) throw new UserError("Confirm the client agreed to publish their words before publishing.", { consent: "Required to publish." });
    const t = db.from(tbl(schema.testimonials));
    if (id) await exec(t.update(vals(schema.testimonials, { ...input, placeholder: false })).eq("id", id));
    else await exec(t.insert(vals(schema.testimonials, input)));
    await audit(user, id ? "update" : "create", "testimonial", id ?? null, `${id ? "Updated" : "Added"} testimonial from ${input.customerName}`);
    refreshSite();
  },
);

export const setTestimonialStatus = adminAction("cms.manage", z.object({ id: zs.uuid(), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }), async ({ id, status }, user) => {
  const t = await one<{ consent: boolean; customerName: string }>(db.from(tbl(schema.testimonials)).select("consent,customerName:customer_name").eq("id", id));
  if (status === "PUBLISHED" && !t.consent) throw new UserError("Record the client's consent first (edit the testimonial).");
  await exec(db.from(tbl(schema.testimonials)).update({ status }).eq("id", id));
  await audit(user, "status", "testimonial", id, `Testimonial from ${t.customerName} → ${status.toLowerCase()}`);
  refreshSite();
});
