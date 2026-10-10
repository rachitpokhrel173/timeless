"use server";

import { z } from "zod";
import { adminDb, exec, maybe, schema, tbl } from "@/db";
import { adminAction, UserError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { supabaseServer } from "@/lib/supabase/server";

/* Preferences are the user's own row; written with the privileged connection after the session check. */
async function updatePrefs(userId: string, patch: Record<string, unknown>) {
  const row = await maybe<{ prefs: Record<string, unknown> | null }>(adminDb.from(tbl(schema.profiles)).select("prefs").eq("id", userId));
  await exec(
    adminDb
      .from(tbl(schema.profiles))
      .update({ prefs: { ...row?.prefs, ...patch } })
      .eq("id", userId),
  );
}

export const setThemePreference = adminAction(null, z.object({ theme: z.enum(["light", "dark", "system"]) }), async ({ theme }, user) => {
  await updatePrefs(user.id, { theme });
});

export const setSidebarCollapsed = adminAction(null, z.object({ collapsed: z.boolean() }), async ({ collapsed }, user) => {
  await updatePrefs(user.id, { sidebarCollapsed: collapsed });
});

export const setDashboardWidgets = adminAction(null, z.object({ widgets: z.array(z.string().max(40)).max(30) }), async ({ widgets }, user) => {
  await updatePrefs(user.id, { widgets });
});

export const updateProfile = adminAction(
  null,
  z.object({ fullName: z.string().trim().min(2, "Enter your name.").max(80), phone: z.string().trim().max(30).optional().nullable() }),
  async ({ fullName, phone }, user) => {
    await exec(adminDb.from(tbl(schema.profiles)).update({ full_name: fullName, phone: phone || null }).eq("id", user.id));
    await audit(user, "update", "user", user.id, "Updated own profile");
  },
);

/** Change password through Supabase Auth after re-checking the current one. */
export const changePassword = adminAction(
  null,
  z
    .object({ current: z.string().min(1, "Enter your current password."), password: z.string().max(200), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match." }),
  async ({ current, password }, user) => {
    if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      throw new UserError("Use at least 10 characters, with letters and a number.", { password: "Too weak." });
    }
    const supabase = await supabaseServer();
    const check = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (check.error) throw new UserError("Current password is incorrect.", { current: "Current password is incorrect." });
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new UserError(error.code === "same_password" ? "Choose a different password." : "Couldn't change the password. Try again.");
    await supabase.auth.signOut({ scope: "others" });
    await audit(user, "password_change", "user", user.id, "Changed own password");
  },
);

export const signOutOtherDevices = adminAction(null, z.object({}), async (_input, user) => {
  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope: "others" });
  await audit(user, "revoke_sessions", "session", null, "Signed out all other devices");
});
