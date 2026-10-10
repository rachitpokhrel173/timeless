"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { adminDb, cols, db, exec, likeEscape, maybe, one, schema, tbl, vals, type Row } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { serviceRoleConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { findCustomer } from "@/server/crm";

const fields = z.object({
  name: zs.required("Name", 160),
  phone: zs.phone(),
  email: zs.email(),
  altPhone: zs.phone(),
  address: zs.optional(300),
  sourceKey: zs.optional(40),
  tags: z
    .string()
    .max(300)
    .optional()
    .nullable()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20),
    ),
});

const customers = () => db.from(tbl(schema.customers));
const contacts = () => db.from(tbl(schema.customerContacts));
const now = () => new Date().toISOString();

export const createCustomer = adminAction("customers.create", fields, async (input, user) => {
  if (!input.phone && !input.email) throw new UserError("Add a phone number or an email.", { phone: "Phone or email is required." });
  const existing = await findCustomer(db, input.phone, input.email);
  if (existing) throw new UserError(`${existing.name} already has that phone or email.`, { phone: "Already used by another customer." });
  const c = await one<{ id: string; name: string }>(customers().insert(vals(schema.customers, input)).select("id,name"));
  await audit(user, "create", "customer", c.id, `Created customer ${c.name}`);
  return { id: c.id };
});

export const updateCustomer = adminAction("customers.update", fields.extend({ id: zs.uuid() }), async ({ id, ...input }, user) => {
  const c = await maybe<{ name: string }>(customers().update(vals(schema.customers, input)).eq("id", id).select("name"));
  if (!c) throw new UserError("Customer not found.");
  await audit(user, "update", "customer", id, `Updated customer ${c.name}`);
});

export const setCustomerArchived = adminAction("customers.update", z.object({ id: zs.uuid(), archived: z.boolean() }), async ({ id, archived }, user) => {
  const c = await one<{ name: string }>(
    customers()
      .update({ archived_at: archived ? now() : null })
      .eq("id", id)
      .select("name"),
  );
  await audit(user, archived ? "archive" : "restore", "customer", id, `${archived ? "Archived" : "Restored"} customer ${c.name}`);
});

export const bulkArchiveCustomers = adminAction("customers.update", z.array(zs.uuid()).min(1).max(500), async (ids, user) => {
  await exec(customers().update({ archived_at: now() }).in("id", ids));
  await audit(user, "bulk_archive", "customer", null, `Archived ${ids.length} customer(s)`);
});

/** Soft delete — only allowed for customers with no bookings or quotations (financial history is kept). */
export const deleteCustomer = adminAction("customers.delete", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const hasBooking = await maybe(db.from(tbl(schema.bookings)).select("id").eq("customer_id", id).limit(1));
  const hasQuote = await maybe(db.from(tbl(schema.quotations)).select("id").eq("customer_id", id).is("deleted_at", null).limit(1));
  if (hasBooking || hasQuote) throw new UserError("This customer has quotations or bookings — archive them instead so their history is kept.");
  const c = await one<{ name: string }>(customers().update({ deleted_at: now() }).eq("id", id).select("name"));
  await audit(user, "delete", "customer", id, `Deleted customer ${c.name}`);
  redirect("/admin/customers");
});

/* ───────── Contacts ───────── */

const contactFields = z.object({
  customerId: zs.uuid(),
  name: zs.required("Name", 120),
  relation: zs.optional(60),
  phone: zs.phone(),
  email: zs.email(),
  isPrimary: z.boolean().default(false),
  notes: zs.optional(500),
});

export const saveContact = adminAction("customers.update", contactFields.extend({ id: zs.optUuid() }), async ({ id, ...input }, user) => {
  if (input.isPrimary) await exec(contacts().update({ is_primary: false }).eq("customer_id", input.customerId));
  if (id) await exec(contacts().update(vals(schema.customerContacts, input)).eq("id", id));
  else await exec(contacts().insert(vals(schema.customerContacts, input)));
  await audit(user, id ? "update" : "create", "customer_contact", id ?? null, `${id ? "Updated" : "Added"} contact ${input.name}`);
});

export const deleteContact = adminAction("customers.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  await exec(contacts().delete().eq("id", id));
  await audit(user, "delete", "customer_contact", id, "Removed a contact");
});

/* ───────── Client portal ───────── */

/**
 * Invite the customer to the client portal (Supabase Auth invite). They set their own password;
 * RLS then lets them see only records linked to their customer id.
 */
export const inviteToPortal = adminAction("customers.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  if (!serviceRoleConfigured()) throw new UserError("The client portal needs Supabase to be configured (service role key).");
  const c = await maybe<Row<typeof schema.customers>>(customers().select(cols(schema.customers)).eq("id", id));
  if (!c) throw new UserError("Customer not found.");
  if (!c.email) throw new UserError("Add the customer's email first.");
  if (c.authUserId) throw new UserError("This customer already has portal access.");
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  // Existing auth user with this email (e.g. invited before) → link it; otherwise send an invitation.
  // Every auth user has a profile (on_auth_user_created trigger), so look it up there.
  const existing = await maybe<{ id: string }>(adminDb.from(tbl(schema.profiles)).select("id").ilike("email", likeEscape(c.email.toLowerCase())));
  let authId = existing?.id;
  if (!authId) {
    const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(c.email, {
      data: { full_name: c.name },
      redirectTo: `${site}/auth/confirm?next=/client`,
    });
    if (error || !data.user) throw new UserError(`Couldn't send the invitation: ${error?.message ?? "unknown error"}`);
    authId = data.user.id;
  }
  const staffRole = await maybe(adminDb.from(tbl(schema.userRoles)).select("user_id").eq("user_id", authId).limit(1));
  if (staffRole) throw new UserError("That email belongs to a staff account. Use a different email for the client portal.");
  await exec(adminDb.from(tbl(schema.customers)).update({ auth_user_id: authId }).eq("id", id));
  await audit(user, "portal_invite", "customer", id, `Invited ${c.name} to the client portal`);
});

export const revokePortal = adminAction("customers.update", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const c = await one<{ name: string }>(adminDb.from(tbl(schema.customers)).update({ auth_user_id: null }).eq("id", id).select("name"));
  await audit(user, "portal_revoke", "customer", id, `Removed client-portal access for ${c.name}`);
});
