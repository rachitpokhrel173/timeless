"use server";

import { z } from "zod";
import { adminDb, db, DbError, exec, likeEscape, many, maybe, one, rpc, schema, tbl } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { ALL_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { invitationRedirectUrl } from "@/lib/auth/redirects";
import { serviceRoleConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/server/notifications";
import { resendInvitation, syncAuthBan } from "@/server/staff-accounts";

const roleById = (id: string) => maybe<{ id: string; key: string; name: string; isSystem: boolean }>(db.from(tbl(schema.roles)).select("id,key,name,isSystem:is_system").eq("id", id));

/** Super Admin can only be granted or removed by a Super Admin (also enforced by RLS). */
function guardSuper(role: { key: string }, user: { roleKeys: string[] }) {
  if (role.key === "SUPER_ADMIN" && !user.roleKeys.includes("SUPER_ADMIN")) throw new UserError("Only a Super Admin can grant or remove Super Admin.");
}

export const inviteUser = adminAction(
  "users.manage",
  z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email."), fullName: zs.required("Name", 120), roleId: zs.uuid(), staffId: zs.optUuid() }),
  async ({ email, fullName, roleId, staffId }, user) => {
    if (!serviceRoleConfigured()) throw new UserError("Inviting users needs the Supabase service role key on the server.");
    const role = await roleById(roleId);
    if (!role) throw new UserError("Choose a role.", { roleId: "Required." });
    guardSuper(role, user);
    let profile = await maybe<{ id: string }>(adminDb.from(tbl(schema.profiles)).select("id").ilike("email", likeEscape(email)));
    if (!profile) {
      const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo: invitationRedirectUrl() });
      if (error || !data.user) throw new UserError(`Couldn't send the invitation: ${error?.message ?? "unknown error"}`);
      profile = { id: data.user.id };
      // The on_auth_user_created trigger creates the profile; make sure it exists before granting
      await exec(adminDb.from(tbl(schema.profiles)).upsert({ id: profile.id, email, full_name: fullName }, { onConflict: "id", ignoreDuplicates: true }));
    }
    const isCustomer = await maybe(adminDb.from(tbl(schema.customers)).select("id").eq("auth_user_id", profile.id).limit(1));
    if (isCustomer) throw new UserError("That email is a client-portal login. Use a different email for staff.");
    await exec(adminDb.from(tbl(schema.profiles)).update({ full_name: fullName, active: true }).eq("id", profile.id));
    if (profile.id === user.id) throw new UserError("You can't invite yourself.");
    await checked(() => exec(db.from(tbl(schema.userRoles)).upsert({ user_id: profile.id, role_id: roleId }, { onConflict: "user_id,role_id", ignoreDuplicates: true })));
    // One login per team member, never a client login, never an archived record (checked by the database)
    if (staffId) await checked(() => rpc(db, "link_staff_login", { p_staff: staffId, p_user: profile.id, p_role: null }));
    await audit(user, "role_grant", "user", profile.id, `Invited ${email} as ${role.name}`);
  },
);

export const setUserRoles = adminAction("users.manage", z.object({ userId: zs.uuid(), roleIds: z.array(zs.uuid()).max(10) }), async ({ userId, roleIds }, user) => {
  const current = await many<{ roleId: string; r: { key: string; name: string } }>(db.from(tbl(schema.userRoles)).select("roleId:role_id,r:roles!inner(key,name)").eq("user_id", userId));
  const roles = await many<{ id: string; key: string; name: string }>(db.from(tbl(schema.roles)).select("id,key,name"));
  const add = roleIds.filter((id) => !current.some((c) => c.roleId === id));
  const remove = current.filter((c) => !roleIds.includes(c.roleId));
  for (const id of add) guardSuper(roles.find((r) => r.id === id) ?? { key: "" }, user);
  for (const c of remove) guardSuper(c.r, user);
  // Only a Super Admin changes their own roles (also enforced by the database, 00026)
  if (userId === user.id && !user.roleKeys.includes("SUPER_ADMIN") && (add.length || remove.length)) throw new UserError("You can't change your own roles — ask another administrator.");
  if (current.length && !roleIds.length) throw new UserError("Keep at least one role — suspend the account instead to stop access.");
  // The database also refuses roles carrying permissions you don't hold, and keeps one active Super Admin.
  // Add first, then remove, so a failure never leaves the login without a role.
  if (add.length) await checked(() => exec(db.from(tbl(schema.userRoles)).insert(add.map((roleId) => ({ user_id: userId, role_id: roleId })))));
  if (remove.length) await checked(() => exec(db.from(tbl(schema.userRoles)).delete().eq("user_id", userId).in("role_id", remove.map((c) => c.roleId))));
  if (add.length || remove.length) await notify({ type: "account.role", title: "Your access has changed", body: `Roles now: ${roleIds.map((id) => roles.find((r) => r.id === id)?.name).filter(Boolean).join(", ") || "none"}`, userId, href: "/admin" });
  await audit(user, "role_change", "user", userId, `Roles changed: +${add.map((id) => roles.find((r) => r.id === id)?.name).join(", ") || "none"} / −${remove.map((c) => c.r.name).join(", ") || "none"}`);
});

export const setUserActive = adminAction("users.manage", z.object({ userId: zs.uuid(), active: z.boolean() }), async ({ userId, active }, user) => {
  if (userId === user.id && !active) throw new UserError("You can't deactivate your own account.");
  const target = await many<{ r: { key: string } }>(db.from(tbl(schema.userRoles)).select("r:roles!inner(key)").eq("user_id", userId));
  if (target.some((t) => t.r.key === "SUPER_ADMIN") && !user.roleKeys.includes("SUPER_ADMIN")) throw new UserError("Only a Super Admin can deactivate a Super Admin.");
  // The database keeps at least one active Super Admin (00026)
  const p = await checked(() => one<{ email: string }>(db.from(tbl(schema.profiles)).update({ active }).eq("id", userId).select("email")));
  // Inactive profiles are refused on every request (loadUser) and by every RLS check, so access
  // stops immediately; the Auth ban also stops new sign-ins and session refreshes.
  await syncAuthBan(userId, active);
  await audit(user, active ? "activate" : "deactivate", "user", userId, `${active ? "Reactivated" : "Deactivated"} ${p.email}`);
  if (active) await notify({ type: "account.reactivated", title: "Your account has been reactivated", userId, href: "/admin" });
});

export const updateUserDetails = adminAction(
  "users.manage",
  z.object({ userId: zs.uuid(), fullName: zs.required("Name", 120), phone: zs.optional(40) }),
  async ({ userId, fullName, phone }, user) => {
    const target = await many<{ r: { key: string } }>(db.from(tbl(schema.userRoles)).select("r:roles!inner(key)").eq("user_id", userId));
    if (target.some((t) => t.r.key === "SUPER_ADMIN") && !user.roleKeys.includes("SUPER_ADMIN") && userId !== user.id) throw new UserError("Only a Super Admin can edit a Super Admin.");
    const p = await one<{ email: string }>(db.from(tbl(schema.profiles)).update({ full_name: fullName, phone }).eq("id", userId).select("email"));
    await audit(user, "update", "user", userId, `Updated the details of ${p.email}`);
  },
);

/** Readable messages from the account functions (00021); everything else stays masked. */
async function checked<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DbError && (error.code === "P0001" || error.code === "42501")) throw new UserError(error.message);
    throw error;
  }
}

export const linkStaff = adminAction("users.manage", z.object({ userId: zs.uuid(), staffId: zs.optUuid() }), async ({ userId, staffId }, user) => {
  if (staffId) await checked(() => rpc(db, "link_staff_login", { p_staff: staffId, p_user: userId, p_role: null }));
  else await exec(db.from(tbl(schema.profiles)).update({ staff_id: null }).eq("id", userId));
  await audit(user, "update", "user", userId, staffId ? "Linked the login to a team member" : "Unlinked the team member");
});

export const resendUserInvitation = adminAction("users.manage", z.object({ userId: zs.uuid() }), async ({ userId }, user) => {
  const staff = await maybe<{ staffId: string | null }>(adminDb.from(tbl(schema.profiles)).select("staffId:staff_id").eq("id", userId));
  return resendInvitation(userId, staff?.staffId ?? null, user);
});

/* ───────── Roles ───────── */

export const saveRole = adminAction(
  "users.manage",
  z.object({ id: zs.optUuid(), name: zs.required("Name", 60), description: zs.optional(300) }),
  async ({ id, name, description }, user) => {
    if (id) await exec(db.from(tbl(schema.roles)).update({ name, description }).eq("id", id));
    else {
      const key = name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      if (await maybe(db.from(tbl(schema.roles)).select("id").eq("key", key))) throw new UserError("A role with that name exists.", { name: "Already used." });
      await exec(db.from(tbl(schema.roles)).insert({ key, name, description, is_system: false }));
    }
    await audit(user, id ? "update" : "create", "role", id ?? null, `${id ? "Updated" : "Created"} role ${name}`);
  },
);

export const setRolePermissions = adminAction(
  "users.manage",
  z.object({ roleId: zs.uuid(), permissions: z.array(z.string()).max(ALL_PERMISSIONS.length) }),
  async ({ roleId, permissions }, user) => {
    const role = await roleById(roleId);
    if (!role) throw new UserError("Role not found.");
    if (role.key === "SUPER_ADMIN") throw new UserError("Super Admin always has every permission.");
    const wanted = permissions.filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p));
    if (role.key === "ADMIN" && !wanted.includes("users.manage")) throw new UserError("Admins need “Manage users & roles”.");
    const current = (await many<{ key: string }>(db.from(tbl(schema.rolePermissions)).select("key:permission_key").eq("role_id", roleId))).map((r) => r.key);
    const add = wanted.filter((p) => !current.includes(p));
    const remove = current.filter((p) => !wanted.includes(p as Permission));
    // You can only grant or remove permissions you hold yourself (also enforced by the database, 00026)
    if (!user.roleKeys.includes("SUPER_ADMIN")) {
      const outside = [...add, ...remove].filter((k) => !user.permissions.has(k as Permission));
      if (outside.length) throw new UserError(`You can only change permissions you have yourself (${outside.join(", ")}).`);
    }
    if (remove.length) await checked(() => exec(db.from(tbl(schema.rolePermissions)).delete().eq("role_id", roleId).in("permission_key", remove)));
    if (add.length) await checked(() => exec(db.from(tbl(schema.rolePermissions)).insert(add.map((k) => ({ role_id: roleId, permission_key: k })))));
    await audit(user, "role_change", "role", roleId, `Permissions for ${role.name}: +${add.length} / −${remove.length}`, { add, remove });
  },
);

export const deleteRole = adminAction("users.manage", z.object({ id: zs.uuid() }), async ({ id }, user) => {
  const role = await roleById(id);
  if (!role) throw new UserError("Role not found.");
  if (role.isSystem) throw new UserError("Built-in roles can't be deleted — remove their permissions instead.");
  if (await maybe(db.from(tbl(schema.userRoles)).select("user_id").eq("role_id", id).limit(1))) throw new UserError("Someone still has this role. Change their roles first.");
  await checked(() => exec(db.from(tbl(schema.roles)).delete().eq("id", id)));
  await audit(user, "delete", "role", id, `Deleted role ${role.name}`);
});
