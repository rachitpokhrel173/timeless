"use server";

import { z } from "zod";
import { db, exec, one, schema, tbl, vals } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";

const time = () =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.slice(0, 5) : null));

export const saveStaff = adminAction(
  "staff.manage",
  z.object({
    id: zs.optUuid(),
    name: zs.required("Name", 120),
    role: zs.optional(80),
    phone: zs.phone(),
    email: zs.email(),
    skills: z
      .string()
      .max(500)
      .optional()
      .nullable()
      .transform((v) =>
        (v ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20),
      ),
    dailyRate: zs.money(),
    notes: zs.optional(2000),
    active: z.boolean().default(true),
  }),
  async ({ id, ...input }, user) => {
    const t = db.from(tbl(schema.staff));
    const row = id ? await one<{ id: string }>(t.update(vals(schema.staff, input)).eq("id", id).select("id")) : await one<{ id: string }>(t.insert(vals(schema.staff, input)).select("id"));
    await audit(user, id ? "update" : "create", "staff", row.id, `${id ? "Updated" : "Added"} team member ${input.name}`);
    return { id: row.id };
  },
);

export const archiveStaff = adminAction("staff.manage", z.object({ id: zs.uuid(), archived: z.boolean() }), async ({ id, archived }, user) => {
  const s = await one<{ name: string }>(db.from(tbl(schema.staff)).update({ archived_at: archived ? new Date().toISOString() : null, active: !archived }).eq("id", id).select("name"));
  await audit(user, archived ? "archive" : "restore", "staff", id, `${archived ? "Archived" : "Restored"} ${s.name}`);
});

export const setAvailability = adminAction(
  "staff.manage",
  z.object({
    staffId: zs.uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
    until: zs.date(),
    status: z.enum(["AVAILABLE", "UNAVAILABLE", "LEAVE"]),
    startTime: time(),
    endTime: time(),
    note: zs.optional(300),
  }),
  async ({ until, ...input }, user) => {
    const last = until && until > input.date ? until : input.date;
    const days: string[] = [];
    for (let d = new Date(`${input.date}T00:00:00Z`); d.toISOString().slice(0, 10) <= last; d = new Date(d.getTime() + 86_400_000)) days.push(d.toISOString().slice(0, 10));
    if (days.length > 60) throw new UserError("Set up to 60 days at a time.", { until: "Too long." });
    await exec(
      db.from(tbl(schema.staffAvailability)).upsert(
        days.map((date) => vals(schema.staffAvailability, { ...input, date })),
        { onConflict: "staff_id,date" },
      ),
    );
    await audit(user, "availability", "staff", input.staffId, `Marked ${input.status.toLowerCase()} for ${days.length} day(s) from ${input.date}`);
  },
);

export const clearAvailability = adminAction("staff.manage", z.object({ id: zs.uuid() }), async ({ id }) => {
  await exec(db.from(tbl(schema.staffAvailability)).delete().eq("id", id));
});
