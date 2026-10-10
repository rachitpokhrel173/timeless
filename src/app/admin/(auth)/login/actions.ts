"use server";

import { redirect } from "next/navigation";
import { adminDb, exec, schema, tbl, total, vals } from "@/db";
import { audit } from "@/lib/audit";
import { getCurrentUser, loadUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, clientUserAgent, hashIp } from "@/lib/request";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";

export type AuthFormState = { error?: string; email?: string; message?: string };

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

function safeNext(next: FormDataEntryValue | null) {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/admin") && !value.startsWith("//") && !value.startsWith("/admin/login") ? value : "/admin";
}

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function recordAttempt(email: string, success: boolean, reason?: string, userId?: string) {
  await exec(
    adminDb.from(tbl(schema.loginAttempts)).insert(
      vals(schema.loginAttempts, {
        email,
        userId,
        success,
        reason,
        ipHash: hashIp(await clientIp()),
        userAgent: await clientUserAgent(),
      }),
    ),
  );
}

/** Email + password sign-in through Supabase Auth, with rate limiting and lockout. */
export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!supabaseConfigured()) return { error: "Sign-in isn't configured yet: Supabase environment variables are missing." };
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { error: "Enter your email and password.", email };

  const ipKey = hashIp(await clientIp()) ?? "unknown";
  if (!(await rateLimit(`login:${ipKey}`, 10, 15 * 60))) {
    await recordAttempt(email, false, "rate_limited");
    return { error: "Too many attempts. Please wait 15 minutes and try again.", email };
  }
  // Lock an account after repeated failures, whatever the IP
  const failures = await total(
    adminDb
      .from(tbl(schema.loginAttempts))
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .eq("success", false)
      .gt("created_at", new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString()),
  );
  if (failures >= MAX_FAILURES) {
    await recordAttempt(email, false, "locked");
    return { error: `Too many failed attempts for this account. Try again in ${LOCK_MINUTES} minutes or reset your password.`, email };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await recordAttempt(email, false, error?.code ?? "invalid_credentials");
    // Same message for unknown email and wrong password
    return { error: error?.code === "email_not_confirmed" ? "Please confirm your email address first." : "Incorrect email or password.", email };
  }

  const user = await loadUser(data.user.id);
  if (!user) {
    await supabase.auth.signOut();
    await recordAttempt(email, false, "inactive", data.user.id);
    return { error: "This account has been deactivated. Contact an administrator.", email };
  }
  await recordAttempt(email, true, undefined, user.id);
  await audit(user, "login", "session", null, "Signed in");
  if (!user.isStaff) redirect("/client");
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await audit(user, "logout", "session", null, "Signed out");
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/** Sends a reset link. Always answers the same way so it can't be used to discover accounts. */
export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!supabaseConfigured()) return { error: "Password reset isn't configured yet." };
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address.", email };
  const ipKey = hashIp(await clientIp()) ?? "unknown";
  if (await rateLimit(`reset:${ipKey}`, 5, 60 * 60)) {
    const supabase = await supabaseServer();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/confirm?next=/admin/reset-password` });
  }
  return { message: "If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder)." };
}

/** Sets a new password for the user signed in through the reset (or invite) link. */
export async function setNewPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return { error: "Use at least 10 characters, with letters and at least one number." };
  }
  if (password !== confirm) return { error: "The passwords don't match." };
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.code === "same_password" ? "Choose a password you haven't used before." : "Couldn't update the password. Try again." };
  // Sign out other devices that may have used the old password
  await supabase.auth.signOut({ scope: "others" });
  const user = await getCurrentUser();
  if (user) await audit(user, "password_change", "user", user.id, "Set a new password");
  redirect(user?.isStaff ? "/admin" : "/client");
}
