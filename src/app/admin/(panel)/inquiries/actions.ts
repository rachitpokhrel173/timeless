"use server";

import { z } from "zod";
import { cols, db, exec, many, maybe, one, schema, tbl, vals, type Row } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { findCustomer, logLeadActivity } from "@/server/crm";
import { notify } from "@/server/notifications";
import { nextNumber } from "@/server/numbering";

const ids = z.array(z.string().uuid()).min(1).max(500);
const inquiries = () => db.from(tbl(schema.inquiries));
const leads = () => db.from(tbl(schema.leads));
const now = () => new Date().toISOString();

export const markInquiriesRead = adminAction("leads.view", ids, async (list, user) => {
  await exec(inquiries().update({ read_at: now() }).in("id", list));
  await audit(user, "bulk_read", "inquiry", null, `Marked ${list.length} inquiry(ies) as read`);
});

export const archiveInquiries = adminAction("leads.update", ids, async (list, user) => {
  await exec(inquiries().update({ archived_at: now(), read_at: now() }).in("id", list));
  await audit(user, "bulk_archive", "inquiry", null, `Archived ${list.length} inquiry(ies)`);
});

/** Spam is hidden from lists and its lead is archived as lost. */
export const markInquiriesSpam = adminAction("leads.update", ids, async (list, user) => {
  const rows = await many<{ leadId: string | null }>(inquiries().update({ spam: true, status: "CANCELLED", read_at: now(), archived_at: now() }).in("id", list).select("leadId:lead_id"));
  const leadIds = rows.map((r) => r.leadId).filter((x): x is string => !!x);
  if (leadIds.length) await exec(leads().update({ archived_at: now(), stage: "LOST", lost_reason: "Spam" }).in("id", leadIds));
  await audit(user, "bulk_spam", "inquiry", null, `Marked ${list.length} inquiry(ies) as spam`);
});

const bulkStatusAction = adminAction("leads.update", z.object({ ids, status: z.enum(schema.inquiryStatus.enumValues) }), async ({ ids: list, status }, user) => {
  await exec(inquiries().update({ status, read_at: now() }).in("id", list));
  await audit(user, "bulk_status", "inquiry", null, `Set ${list.length} inquiry(ies) to ${status}`);
});
export const bulkInquiryStatus = async (status: (typeof schema.inquiryStatus.enumValues)[number], list: string[]) => bulkStatusAction({ ids: list, status });

export const updateInquiry = adminAction(
  "leads.update",
  z.object({ id: zs.uuid(), status: z.enum(schema.inquiryStatus.enumValues), assignedTo: zs.optUuid() }),
  async ({ id, status, assignedTo }, user) => {
    const before = await maybe<Row<typeof schema.inquiries>>(inquiries().select(cols(schema.inquiries)).eq("id", id));
    if (!before) throw new UserError("Inquiry not found.");
    await exec(inquiries().update(vals(schema.inquiries, { status, assignedTo, readAt: before.readAt ?? new Date() })).eq("id", id));
    // Keep the lead's owner and stage roughly in step with the inquiry
    if (before.leadId) {
      if (assignedTo !== before.assignedTo) await exec(leads().update({ assigned_to: assignedTo }).eq("id", before.leadId));
      if (status === "CONTACTED") await exec(leads().update({ stage: "CONTACTED", last_contact_at: now() }).eq("id", before.leadId));
      if (status !== before.status) await logLeadActivity(db, before.leadId, "SYSTEM", `Inquiry ${before.number} marked ${status.toLowerCase()}`, user.id);
    }
    if (assignedTo && assignedTo !== before.assignedTo && assignedTo !== user.id) {
      await notify({ type: "inquiry.assigned", title: `${user.name} assigned you inquiry ${before.number}`, href: `/admin/inquiries/${id}`, userId: assignedTo });
    }
    await audit(user, "update", "inquiry", id, `Updated inquiry ${before.number}: ${status.toLowerCase()}`);
  },
);

/** Staff-entered inquiry (phone, walk-in, social) — goes through the same lead/customer flow as the website. */
export const createInquiryAction = adminAction(
  "leads.create",
  z.object({
    name: zs.required("Name", 120),
    phone: zs.required("Phone", 30).refine((v) => /^\+?[\d\s()-]{7,}$/.test(v), "Enter a valid phone number."),
    email: zs.email(),
    eventType: zs.required("Event type", 60),
    eventDate: zs.date(),
    venue: zs.optional(200),
    guestCount: zs.optional(40),
    budget: zs.optional(60),
    sourceKey: z.string().min(1).max(40),
    message: zs.optional(3000),
    assignedTo: zs.optUuid(),
  }),
  async (input, user) => {
    let customer = await findCustomer(db, input.phone, input.email);
    if (!customer) {
      customer = await one<Row<typeof schema.customers>>(
        db
          .from(tbl(schema.customers))
          .insert(vals(schema.customers, { name: input.name, phone: input.phone, email: input.email, sourceKey: input.sourceKey }))
          .select(cols(schema.customers)),
      );
    }
    const leadValues = vals(schema.leads, {
        number: await nextNumber("LD", db),
        customerId: customer.id,
        name: input.name,
        phone: input.phone,
        email: input.email,
        eventType: input.eventType,
        eventDate: input.eventDate,
        location: input.venue,
        guestCount: input.guestCount,
        budget: input.budget,
        sourceKey: input.sourceKey,
        assignedTo: input.assignedTo ?? user.id,
        position: -(Date.now() % 1_000_000_000),
      });
    const lead = await one<{ id: string }>(leads().insert(leadValues).select("id"));
    const inquiry = await one<{ id: string; number: string }>(
      inquiries()
        .insert(vals(schema.inquiries, { ...input, number: await nextNumber("IQ", db), leadId: lead.id, customerId: customer.id, assignedTo: input.assignedTo ?? user.id, readAt: new Date() }))
        .select("id,number"),
    );
    await logLeadActivity(db, lead.id, "SYSTEM", `Inquiry ${inquiry.number} recorded by ${user.name}`, user.id);
    await audit(user, "create", "inquiry", inquiry.id, `Recorded inquiry ${inquiry.number} for ${input.name}`);
    return { id: inquiry.id };
  },
);
