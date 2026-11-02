import "server-only";
import { adminDb, db, exec, likeEscape, many, maybe, rpc, schema, tbl } from "@/db";
import { UserError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { invitationRedirectUrl } from "@/lib/auth/redirects";
import type { SessionUser } from "@/lib/auth/session";
import { serviceRoleConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "./notifications";

/*
 * Staff profile → login account → role → permissions.
 *
 *   staff               the employee record (Staff module)
 *   profiles.staff_id   the link from a Supabase Auth login to that record (unique: one login each)
 *   user_roles          the login's role(s), whose permissions RLS and the app enforce
 *
 * Invitations go through Supabase Auth (inviteUserByEmail) — the same email template and
 * /admin/accept-invitation page the admin invitations already use. No password is ever stored here.
 * Linking and suspending run through permission-checked database functions (00021), as the
 * signed-in admin, so the rules hold even for direct API calls.
 */

/** Supabase caps email-link expiry at 24 hours, so an older unaccepted invitation can't be used any more. */
const INVITE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type AuthInfo = { invitedAt: string | null; confirmedAt: string | null; lastSignInAt: string | null };

/** Invitation / confirmation / last sign-in per Auth user (service role; callers check access first). */
export async function authInfo(userIds: string[]): Promise<Map<string, AuthInfo>> {
  const out = new Map<string, AuthInfo>();
  const wanted = new Set(userIds);
  if (!wanted.size || !serviceRoleConfigured()) return out;
  try {
    // Small team: page through every Auth user (1,000 per page) and keep the ones asked for
    for (let page = 1; page <= 20 && out.size < wanted.size; page++) {
      const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const u of data.users) {
        if (wanted.has(u.id)) out.set(u.id, { invitedAt: u.invited_at ?? null, confirmedAt: u.email_confirmed_at ?? u.confirmed_at ?? null, lastSignInAt: u.last_sign_in_at ?? null });
      }
      if (data.users.length < 1000) break;
    }
  } catch (error) {
    console.error("[staff-accounts] couldn't read Auth users:", (error as Error).message);
  }
  return out;
}

export type AccountStatus = "NONE" | "INVITE_FAILED" | "PENDING" | "EXPIRED" | "ACTIVE" | "SUSPENDED";

export const ACCOUNT_STATUS: Record<AccountStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  ACTIVE: { label: "Active", tone: "success" },
  PENDING: { label: "Invitation pending", tone: "info" },
  EXPIRED: { label: "Invitation expired", tone: "warning" },
  INVITE_FAILED: { label: "Invitation failed", tone: "danger" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
  NONE: { label: "No login account", tone: "neutral" },
};

/** Where a login stands. `login` is the linked profile (null = none); `auth` its Auth record. */
export function accountStatus(login: { active: boolean } | null, auth: AuthInfo | undefined, inviteError?: string | null): AccountStatus {
  if (!login) return inviteError ? "INVITE_FAILED" : "NONE";
  if (!login.active) return "SUSPENDED";
  if (!auth || auth.confirmedAt || auth.lastSignInAt) return "ACTIVE";
  if (auth.invitedAt && Date.now() - new Date(auth.invitedAt).getTime() > INVITE_MAX_AGE_MS) return "EXPIRED";
  return "PENDING";
}

export const inviteIsOpen = (s: AccountStatus) => s === "PENDING" || s === "EXPIRED";

/* ───────────────────────── Roles ───────────────────────── */

export type RoleOption = { id: string; key: string; name: string; description: string | null };

export const roleList = () => many<RoleOption>(adminDb.from(tbl(schema.roles)).select("id,key,name,description").order("is_system", { ascending: false }).order("name"));

/** Roles this admin may hand out from the Staff screens. Never Super Admin unless they are one; only Staff without users.manage. */
export function assignableRoles(roles: RoleOption[], user: SessionUser) {
  if (!user.permissions.has("users.manage")) return roles.filter((r) => r.key === "STAFF");
  return roles.filter((r) => r.key !== "SUPER_ADMIN" || user.roleKeys.includes("SUPER_ADMIN"));
}

/** Role keys per login. */
export async function rolesOf(userIds: string[]) {
  const out = new Map<string, { key: string; name: string }[]>();
  if (!userIds.length) return out;
  const rows = await many<{ userId: string; r: { key: string; name: string } }>(adminDb.from(tbl(schema.userRoles)).select("userId:user_id,r:roles!inner(key,name)").in("user_id", userIds));
  for (const row of rows) out.set(row.userId, [...(out.get(row.userId) ?? []), row.r]);
  return out;
}

/**
 * Give a login exactly one role (Staff screens offer one role per person; Users & Roles still
 * allows several). Runs as the admin (RLS: users.manage, Super Admin only by a Super Admin).
 */
export async function replaceRole(userId: string, roleKey: string, user: SessionUser) {
  if (!user.permissions.has("users.manage")) throw new UserError("Only an administrator can change roles.");
  const roles = await roleList();
  const role = roles.find((r) => r.key === roleKey);
  if (!role) throw new UserError("Choose a role.", { roleKey: "Required." });
  const current = await many<{ roleId: string; r: { key: string; name: string } }>(db.from(tbl(schema.userRoles)).select("roleId:role_id,r:roles!inner(key,name)").eq("user_id", userId));
  const isSuper = user.roleKeys.includes("SUPER_ADMIN");
  if ((role.key === "SUPER_ADMIN" || current.some((c) => c.r.key === "SUPER_ADMIN")) && !isSuper) throw new UserError("Only a Super Admin can grant or remove Super Admin.");
  if (userId === user.id) throw new UserError("You can't change your own role here — ask another administrator.");
  if (current.length === 1 && current[0]!.roleId === role.id) return { changed: false, from: current.map((c) => c.r.name), to: role.name };
  if (current.some((c) => c.r.key === "SUPER_ADMIN") && role.key !== "SUPER_ADMIN") {
    const supers = await many<{ userId: string }>(db.from(tbl(schema.userRoles)).select("userId:user_id,r:roles!inner(key)").eq("r.key", "SUPER_ADMIN"));
    if (supers.filter((s) => s.userId !== userId).length === 0) throw new UserError("Keep at least one Super Admin.");
  }
  // Add first, then remove the rest, so the login is never left without a role
  if (!current.some((c) => c.roleId === role.id)) await exec(db.from(tbl(schema.userRoles)).insert({ user_id: userId, role_id: role.id }));
  const drop = current.filter((c) => c.roleId !== role.id);
  if (drop.length) await exec(db.from(tbl(schema.userRoles)).delete().eq("user_id", userId).in("role_id", drop.map((c) => c.roleId)));
  await audit(user, "role_change", "user", userId, `Role changed: ${current.map((c) => c.r.name).join(", ") || "none"} → ${role.name}`, { from: current.map((c) => c.r.key), to: role.key });
  await notify({ type: "account.role", title: `Your access changed: you're now ${role.name}`, body: "Sign out and back in if a page looks out of date.", userId, href: "/admin" });
  return { changed: true, from: current.map((c) => c.r.name), to: role.name };
}

/* ───────────────────────── Invitations & linking ───────────────────────── */

export type LoginPlan = { mode: "none" } | { mode: "invite"; email: string } | { mode: "link"; userId: string };
export type StepResult = { step: string; ok: boolean; message: string };

/** A login account for this email: the existing one, or a new invitation. Never creates a second account. */
async function findOrInvite(email: string, fullName: string): Promise<{ userId: string; invited: boolean }> {
  const existing = await maybe<{ id: string }>(adminDb.from(tbl(schema.profiles)).select("id").ilike("email", likeEscape(email)));
  if (existing) return { userId: existing.id, invited: false };
  if (!serviceRoleConfigured()) throw new UserError("Invitations need the Supabase service role key on the server.");
  const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo: invitationRedirectUrl() });
  if (error || !data.user) throw new UserError(`Supabase didn't send the invitation: ${error?.message ?? "unknown error"}`);
  // The on_auth_user_created trigger creates the profile; make sure it's there before linking
  await exec(adminDb.from(tbl(schema.profiles)).upsert({ id: data.user.id, email, full_name: fullName }, { onConflict: "id", ignoreDuplicates: true }));
  return { userId: data.user.id, invited: true };
}

const recordInvite = (staffId: string, ok: boolean, user: SessionUser, error?: string) =>
  exec(adminDb.from(tbl(schema.staff)).update(ok ? { invited_at: new Date().toISOString(), invited_by: user.id, invite_error: null } : { invite_error: (error ?? "Unknown error").slice(0, 300) }).eq("id", staffId));

/**
 * Give a team member a login: invite their email (or reuse the account that already has it) or
 * link a chosen existing account, then give it the role. Safe to repeat after a partial failure —
 * an account is found again by email, never created twice. Returns what happened at each step.
 */
export async function provisionLogin(staff: { id: string; name: string }, plan: Exclude<LoginPlan, { mode: "none" }>, roleKey: string, user: SessionUser): Promise<StepResult[]> {
  if (!user.permissions.has("staff.invite") && !user.permissions.has("users.manage")) throw new UserError("You don't have permission to give team members a login.");
  const steps: StepResult[] = [];
  let userId: string;
  if (plan.mode === "invite") {
    try {
      const r = await findOrInvite(plan.email, staff.name);
      userId = r.userId;
      if (r.invited) {
        await recordInvite(staff.id, true, user);
        steps.push({ step: "Invitation", ok: true, message: `Invitation email sent to ${plan.email}.` });
        await audit(user, "invite", "staff", staff.id, `Invited ${plan.email} to sign in as ${staff.name}`, { userId });
        await notify({ type: "staff.invited", title: `${staff.name} was invited to sign in`, body: plan.email, permission: "staff.invite", href: `/admin/staff/${staff.id}?tab=login`, entityType: "staff", entityId: staff.id });
      } else {
        steps.push({ step: "Invitation", ok: true, message: `${plan.email} already has a login account — it was linked instead of sending a new invitation.` });
      }
    } catch (error) {
      const message = error instanceof UserError ? error.message : "The invitation couldn't be sent.";
      if (!(error instanceof UserError)) console.error("[staff-accounts] invite failed:", error);
      await recordInvite(staff.id, false, user, message);
      await audit(user, "invite_failed", "staff", staff.id, `Invitation to ${plan.email} failed: ${message}`);
      steps.push({ step: "Invitation", ok: false, message });
      return steps;
    }
  } else {
    userId = plan.userId;
  }

  try {
    await rpc(db, "link_staff_login", { p_staff: staff.id, p_user: userId, p_role: roleKey });
    const login = await maybe<{ email: string }>(adminDb.from(tbl(schema.profiles)).select("email").eq("id", userId));
    steps.push({ step: "Link & role", ok: true, message: `Login ${login?.email ?? ""} linked with the ${roleKey.replace(/_/g, " ").toLowerCase()} role.` });
    await audit(user, "link", "staff", staff.id, `Linked login ${login?.email ?? userId} to ${staff.name} (${roleKey})`, { userId, roleKey });
  } catch (error) {
    const message = (error as { message?: string }).message ?? "";
    // Messages raised by link_staff_login are written for people; anything else is masked
    const readable = /team member|login|role|Super Admin|administrator|client|archived|permission/i.test(message) ? message : "The login couldn't be linked.";
    if (readable !== message) console.error("[staff-accounts] link failed:", error);
    steps.push({ step: "Link & role", ok: false, message: `${readable}${plan.mode === "invite" ? " The account exists — use “Link existing account” on their Login tab to finish." : ""}` });
  }
  return steps;
}

/** Send the invitation email again (only while it hasn't been accepted). */
export async function resendInvitation(userId: string, staffId: string | null, user: SessionUser) {
  if (!serviceRoleConfigured()) throw new UserError("Invitations need the Supabase service role key on the server.");
  const login = await maybe<{ email: string; fullName: string; active: boolean }>(adminDb.from(tbl(schema.profiles)).select("email,fullName:full_name,active").eq("id", userId));
  if (!login) throw new UserError("Login not found.");
  if (!login.active) throw new UserError("This login is suspended — reactivate it first.");
  const info = (await authInfo([userId])).get(userId);
  if (info && (info.confirmedAt || info.lastSignInAt)) throw new UserError("They've already activated their account. They can use “Forgot password” if they can't sign in.");
  const { error } = await supabaseAdmin().auth.admin.inviteUserByEmail(login.email, { data: { full_name: login.fullName }, redirectTo: invitationRedirectUrl() });
  if (error) {
    if (staffId) await recordInvite(staffId, false, user, error.message);
    throw new UserError(`Supabase didn't send the invitation: ${error.message}`);
  }
  if (staffId) await recordInvite(staffId, true, user);
  await audit(user, "invite", staffId ? "staff" : "user", staffId ?? userId, `Re-sent the invitation to ${login.email}`, { userId });
  return { email: login.email };
}
