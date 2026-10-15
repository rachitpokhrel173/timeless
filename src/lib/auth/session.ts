import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import type { UserPrefs } from "@/db/schema";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";
import type { Permission } from "./permissions";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  /** Role keys, e.g. ["SALES"]. Empty for client-portal customers. */
  roleKeys: string[];
  roleName: string;
  permissions: Set<Permission>;
  isStaff: boolean;
  staffId: string | null;
  prefs: UserPrefs;
  sessionId: string | null;
};

/**
 * The signed-in Supabase user with their profile, roles and permissions — or null.
 * The session JWT is verified by Supabase (getClaims verifies the signature; getUser asks the
 * Auth server). Cached for the duration of one request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (!supabaseConfigured()) return null;
  const supabase = await supabaseServer();

  let userId: string | null = null;
  let sessionId: string | null = null;
  const claims = await supabase.auth.getClaims().catch(() => null);
  if (claims?.data?.claims?.sub) {
    userId = claims.data.claims.sub;
    sessionId = (claims.data.claims.session_id as string | undefined) ?? null;
  } else {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  }
  if (!userId) return null;
  return loadUser(userId, sessionId);
});

/** Profile, roles and permissions for a Supabase user id; null when missing or deactivated. */
export async function loadUser(userId: string, sessionId: string | null = null): Promise<SessionUser | null> {
  const profile = await maybe<Row<typeof schema.profiles>>(adminDb.from(tbl(schema.profiles)).select(cols(schema.profiles)).eq("id", userId));
  if (!profile || !profile.active) return null;

  const rows = await many<{ role: { key: string; name: string; permissions: { key: string }[] } }>(
    adminDb.from(tbl(schema.userRoles)).select("role:roles!inner(key,name,permissions:role_permissions(key:permission_key))").eq("user_id", userId),
  );

  const roleKeys = [...new Set(rows.map((r) => r.role.key))];
  const roleNames = [...new Set(rows.map((r) => r.role.name))];
  return {
    id: profile.id,
    name: profile.fullName || profile.email,
    email: profile.email,
    roleKeys,
    roleName: roleNames.join(", ") || "Client",
    permissions: new Set(rows.flatMap((r) => r.role.permissions.map((p) => p.key)) as Permission[]),
    isStaff: roleKeys.length > 0,
    staffId: profile.staffId,
    prefs: profile.prefs,
    sessionId,
  };
}

export const can = (user: SessionUser | null, permission: Permission) => !!user?.permissions.has(permission);

// Sign-in methods Supabase records (JWT `amr` claim) when someone arrives through an email link
const EMAIL_LINK_METHODS = new Set(["invite", "recovery", "otp", "magiclink", "email/signup"]);
const EMAIL_LINK_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * The Supabase user when the current session was started from an invitation or password-reset
 * link in the last 24 hours — the only sessions allowed to set a password without the old one.
 * A session from an ordinary password sign-in returns null (use Account → Password instead).
 */
export async function emailLinkSession(): Promise<{ id: string; email: string | null } | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const now = Date.now() / 1000;
  const amr = (Array.isArray(claims.amr) ? claims.amr : []) as { method?: string; timestamp?: number }[];
  const fromLink = amr.some((a) => !!a.method && EMAIL_LINK_METHODS.has(a.method) && now - (a.timestamp ?? 0) < EMAIL_LINK_MAX_AGE_SECONDS);
  if (!fromLink) return null;
  // The JWT is checked locally; also ask the Auth server, so a session revoked by sign-out is refused
  const { data: live } = await supabase.auth.getUser();
  if (live.user?.id !== claims.sub) return null;
  return { id: claims.sub, email: live.user.email ?? null };
}

/** For admin pages: sign-in required, staff only, and optionally a specific permission. */
export async function requirePage(permission?: Permission) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!user.isStaff) redirect("/client");
  if (permission && !user.permissions.has(permission)) redirect(`/admin/denied?need=${permission}`);
  return user;
}
