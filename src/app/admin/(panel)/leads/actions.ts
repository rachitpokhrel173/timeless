"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cols, db, exec, many, maybe, one, schema, tbl, vals, type Row } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { completeFollowup, createLead, ensureCustomerForLead, LEAD_STAGES, logLeadActivity, moveLead, syncNextFollowup } from "@/server/crm";
import { notify } from "@/server/notifications";

const leadFields = z.object({
  name: zs.required("Name", 120),
  phone: zs.phone(),
  email: zs.email(),
  eventType: zs.optional(60),
  eventDate: zs.date(),
  location: zs.optional(200),
  guestCount: zs.optional(40),
  budget: zs.optional(60),
  sourceKey: z.string().min(1).max(40),
  priority: z.enum(schema.priority.enumValues),
  assignedTo: zs.optUuid(),
  campaignId: zs.optUuid(),
});

function requireContact(v: { phone: string | null; email: string | null }) {
  if (!v.phone && !v.email) throw new UserError("Add a phone number or an email.", { phone: "Phone or email is required." });
}

function notifyAssignee(assignee: string | null | undefined, actor: { id: string; name: string }, leadId: string, name: string) {
  if (assignee && assignee !== actor.id) {
    return notify({ type: "lead.assigned", title: `${actor.name} assigned you a lead: ${name}`, href: `/admin/leads/${leadId}`, entityType: "lead", entityId: leadId, userId: assignee });
  }
}

export const createLeadAction = adminAction("leads.create", leadFields.extend({ notes: zs.optional(2000) }), async ({ notes, ...input }, user) => {
  requireContact(input);
  const lead = await createLead(db, input, user);
  if (notes) await logLeadActivity(db, lead.id, "NOTE", notes, user.id);
  await notifyAssignee(input.assignedTo, user, lead.id, lead.name);
  await audit(user, "create", "lead", lead.id, `Created lead ${lead.number} (${lead.name})`);
  return { id: lead.id };
});

export const updateLeadAction = adminAction("leads.update", leadFields.extend({ id: zs.uuid() }), async ({ id, ...input }, user) => {
  requireContact(input);
  const before = await maybe<Row<typeof schema.leads>>(leads().select(cols(schema.leads)).eq("id", id));
  if (!before) throw new UserError("Lead not found.");
  await exec(leads().update(vals(schema.leads, input)).eq("id", id));
  if (input.assignedTo !== before.assignedTo) {
    await logLeadActivity(db, id, "SYSTEM", input.assignedTo ? "Lead reassigned" : "Lead unassigned", user.id);
    await notifyAssignee(input.assignedTo, user, id, input.name);
  }
  await audit(user, "update", "lead", id, `Updated lead ${before.number}`);
});

export const moveLeadAction = adminAction(
  "leads.update",
  z.object({ id: zs.uuid(), stage: z.enum(LEAD_STAGES), beforeId: zs.optUuid(), lostReason: zs.optional(300) }),
  async ({ id, stage, beforeId, lostReason }, user) => {
    const result = await moveLead(db, id, stage, beforeId, user, lostReason);
    if (result.from !== result.to) await audit(user, "stage", "lead", id, `Moved lead ${result.lead.number} from ${result.from} to ${result.to}`);
  },
);

const bulkStage = adminAction("leads.update", z.object({ ids: z.array(zs.uuid()).min(1).max(500), stage: z.enum(LEAD_STAGES) }), async ({ ids, stage }, user) => {
  const rows = await many<{ id: string }>(leads().update({ stage }).in("id", ids).select("id"));
  for (const r of rows) await logLeadActivity(db, r.id, "STAGE_CHANGE", `Moved to ${stage} (bulk)`, user.id);
  await audit(user, "bulk_stage", "lead", null, `Moved ${rows.length} lead(s) to ${stage}`, { ids });
});
export const bulkLeadStage = async (stage: (typeof LEAD_STAGES)[number], ids: string[]) => bulkStage({ ids, stage });

const bulkAssign = adminAction("leads.update", z.object({ ids: z.array(zs.uuid()).min(1).max(500), userId: zs.optUuid() }), async ({ ids, userId }, user) => {
  await exec(leads().update({ assigned_to: userId }).in("id", ids));
  if (userId && userId !== user.id) await notify({ type: "lead.assigned", title: `${user.name} assigned you ${ids.length} lead(s)`, href: "/admin/leads?assigned=me", userId });
  await audit(user, "bulk_assign", "lead", null, `Assigned ${ids.length} lead(s)`, { ids, userId });
});
export const bulkAssignLeads = async (userId: string | null, ids: string[]) => bulkAssign({ ids, userId });

export const bulkArchiveLeads = adminAction("leads.update", z.array(zs.uuid()).min(1).max(500), async (ids, user) => {
  await exec(leads().update({ archived_at: new Date().toISOString() }).in("id", ids));
  await audit(user, "bulk_archive", "lead", null, `Archived ${ids.length} lead(s)`, { ids });
});

export const setLeadArchived = adminAction("leads.update", z.object({ id: zs.uuid(), archived: z.boolean() }), async ({ id, archived }, user) => {
  const lead = await one<{ number: string }>(
    leads()
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .select("number"),
  );
  await audit(user, archived ? "archive" : "restore", "lead", id, `${archived ? "Archived" : "Restored"} lead ${lead.number}`);
});

/** Soft delete (restricted permission); quotations and bookings keep their history. */
export const deleteLead = adminAction("leads.delete", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const lead = await maybe<{ number: string; name: string }>(leads().update({ deleted_at: new Date().toISOString() }).eq("id", id).select("number,name"));
  if (!lead) throw new UserError("Lead not found.");
  await audit(user, "delete", "lead", id, `Deleted lead ${lead.number} (${lead.name})`);
  redirect("/admin/leads");
});

export const convertLeadToCustomer = adminAction(["customers.create", "leads.update"], z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const customerId = await ensureCustomerForLead(db, id, user);
  await audit(user, "convert", "lead", id, "Converted lead to customer", { customerId });
  return { customerId };
});

/** Log a call, WhatsApp, email, meeting or note on the lead's timeline. */
export const logActivityAction = adminAction(
  "leads.update",
  z.object({ leadId: zs.uuid(), type: z.enum(["NOTE", "CALL", "WHATSAPP", "EMAIL", "MEETING"]), body: zs.required("Details", 2000) }),
  async ({ leadId, type, body }, user) => {
    await logLeadActivity(db, leadId, type, body, user.id);
    if (type !== "NOTE") {
      await exec(leads().update({ last_contact_at: new Date().toISOString() }).eq("id", leadId));
      // First contact moves a brand-new lead along the pipeline
      await exec(leads().update({ stage: "CONTACTED" }).eq("id", leadId).eq("stage", "NEW"));
    }
  },
);

/* ───────── Follow-ups ───────── */

const followupFields = z.object({
  leadId: zs.optUuid(),
  inquiryId: zs.optUuid(),
  customerId: zs.optUuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable()
    .transform((v) => v || "10:00"),
  type: z.enum(schema.followupType.enumValues),
  priority: z.enum(schema.priority.enumValues).default("MEDIUM"),
  note: zs.optional(1000),
  assignedTo: zs.optUuid(),
});
const leads = () => db.from(tbl(schema.leads));
const followups = () => db.from(tbl(schema.followups));
type Followup = Row<typeof schema.followups>;
const dueAt = (date: string, time: string) => new Date(`${date}T${time}:00+05:45`);

export const addFollowup = adminAction("leads.update", followupFields, async ({ date, time, ...input }, user) => {
  if (!input.leadId && !input.customerId && !input.inquiryId) throw new UserError("Choose a lead, inquiry or customer.");
  // Follow-ups on an inquiry also show on its lead
  if (input.inquiryId && !input.leadId) {
    const inq = await maybe<{ leadId: string | null }>(db.from(tbl(schema.inquiries)).select("leadId:lead_id").eq("id", input.inquiryId));
    input.leadId = inq?.leadId ?? null;
  }
  const when = dueAt(date, time);
  const f = await one<Followup>(
    followups()
      .insert(vals(schema.followups, { ...input, dueAt: when, status: when < new Date() ? "OVERDUE" : "PENDING", assignedTo: input.assignedTo ?? user.id, createdBy: user.id }))
      .select(cols(schema.followups)),
  );
  await syncNextFollowup(db, f.leadId);
  if (f.leadId) await logLeadActivity(db, f.leadId, "SYSTEM", `Follow-up scheduled for ${date} ${time} (${input.type.toLowerCase()})`, user.id);
  if (f.assignedTo && f.assignedTo !== user.id) {
    await notify({ type: "followup.assigned", title: `${user.name} scheduled a follow-up for you`, href: f.leadId ? `/admin/leads/${f.leadId}` : "/admin/follow-ups", userId: f.assignedTo });
  }
  await audit(user, "create", "followup", f.id, `Scheduled a ${input.type.toLowerCase()} follow-up for ${date}`);
});

export const updateFollowup = adminAction("leads.update", followupFields.extend({ id: zs.uuid() }), async ({ id, date, time, ...input }, user) => {
  const when = dueAt(date, time);
  const next = when < new Date() ? "OVERDUE" : "PENDING";
  const current = await maybe<{ status: string }>(followups().select("status").eq("id", id));
  if (!current) throw new UserError("Follow-up not found.");
  const f = await one<Followup>(
    followups()
      .update(vals(schema.followups, { ...input, dueAt: when, ...(["PENDING", "OVERDUE"].includes(current.status) && { status: next }) }))
      .eq("id", id)
      .select(cols(schema.followups)),
  );
  await syncNextFollowup(db, f.leadId);
  await audit(user, "update", "followup", id, `Rescheduled a follow-up to ${date}`);
});

export const completeFollowupAction = adminAction("leads.update", z.object({ id: zs.uuid(), outcome: zs.optional(500) }), async ({ id, outcome }, user) => {
  await completeFollowup(db, id, outcome, user);
  await audit(user, "complete", "followup", id, "Completed a follow-up");
});

export const cancelFollowup = adminAction("leads.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const f = await maybe<Followup>(followups().update({ status: "CANCELLED" }).eq("id", id).in("status", ["PENDING", "OVERDUE"]).select(cols(schema.followups)));
  if (!f) throw new UserError("Completed follow-ups are kept for history.");
  await syncNextFollowup(db, f.leadId);
  await audit(user, "cancel", "followup", id, "Cancelled a follow-up");
});
