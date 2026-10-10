"use server";

import { z } from "zod";
import { db, exec, maybe, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { refreshSite } from "@/server/revalidate";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export const saveService = adminAction(
  "cms.manage",
  z.object({
    id: zs.optUuid(),
    name: zs.required("Name", 120),
    slug: zs.optional(60),
    summary: zs.required("Summary", 300),
    description: zs.required("Description", 4000),
    imageId: zs.optUuid(),
    eventType: zs.optional(60),
    featured: z.boolean().default(false),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("PUBLISHED"),
    position: zs.int().default(0),
  }),
  async ({ id, ...input }, user) => {
    const slug = slugify(input.slug || input.name);
    const clash = await maybe<{ id: string }>(db.from(tbl(schema.services)).select("id").eq("slug", slug));
    if (clash && clash.id !== id) throw new UserError("Another service already uses that URL name.", { slug: "Already used." });
    const t = db.from(tbl(schema.services));
    if (id) await exec(t.update(vals(schema.services, { ...input, slug })).eq("id", id));
    else await exec(t.insert(vals(schema.services, { ...input, slug })));
    await audit(user, id ? "update" : "create", "service", id ?? null, `${id ? "Updated" : "Added"} service ${input.name}`);
    refreshSite();
  },
);

export const saveServiceItem = adminAction(
  "cms.manage",
  z.object({ id: zs.optUuid(), serviceId: zs.uuid(), title: zs.required("Title", 160), description: zs.optional(1000), position: zs.int().default(0) }),
  async ({ id, ...input }, user) => {
    const t = db.from(tbl(schema.serviceItems));
    if (id) await exec(t.update(vals(schema.serviceItems, input)).eq("id", id));
    else await exec(t.insert(vals(schema.serviceItems, input)));
    await audit(user, id ? "update" : "create", "service", input.serviceId, `${id ? "Updated" : "Added"} “${input.title}”`);
    refreshSite();
  },
);

export const deleteServiceItem = adminAction("cms.manage", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const r = await one<{ serviceId: string; title: string }>(db.from(tbl(schema.serviceItems)).delete().eq("id", id).select("serviceId:service_id,title"));
  await audit(user, "delete", "service", r.serviceId, `Removed “${r.title}”`);
  refreshSite();
});
