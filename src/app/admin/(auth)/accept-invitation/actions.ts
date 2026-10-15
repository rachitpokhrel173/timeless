"use server";

import { audit } from "@/lib/audit";
import { passwordProblem } from "@/lib/auth/password-rules";
import { emailLinkSession, loadUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/lib/request";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";

export type InvitationState = {
  /** "expired" / "invalid": the link can't be used any more — ask for a new invitation. */
  status?: "expired" | "invalid" | "done";
  error?: string;
  /** The invitation token has been used and the session is set: don't send the token again. */
  verified?: boolean;
  email?: string;
  redirectTo?: string;
};

// Supabase token hashes are hex strings; anything else is not worth sending to the Auth server
const TOKEN_HASH = /^(pkce_)?[a-f0-9]{20,128}$/i;

/**
 * Accept an invitation and choose a password, in one step.
 *
 * The invitation token is verified here (a POST) rather than when the page opens, so email
 * security scanners that pre-open links can't use up the one-time token. The password is
 * validated before the token is spent; Supabase then marks the token used, so it can't be replayed.
 * Only the account the token belongs to (now the session user) gets the new password.
 */
export async function acceptInvitation(prev: InvitationState, formData: FormData): Promise<InvitationState> {
  try {
    return await accept(prev, formData);
  } catch {
    // Supabase or the database is unreachable — never report success, and keep what we know
    return { ...prev, status: undefined, error: "We couldn't reach the server. Check your connection and try again." };
  }
}

async function accept(prev: InvitationState, formData: FormData): Promise<InvitationState> {
  if (!supabaseConfigured()) return { error: "Sign-in isn't configured on this server yet." };
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const tokenHash = prev.verified ? "" : String(formData.get("token_hash") ?? "");

  const problem = passwordProblem(password);
  if (problem) return { ...prev, status: undefined, error: problem };
  if (password !== confirm) return { ...prev, status: undefined, error: "The passwords don't match." };

  const ipKey = hashIp(await clientIp()) ?? "unknown";
  if (!(await rateLimit(`invite-accept:${ipKey}`, 10, 15 * 60))) {
    return { ...prev, error: "Too many attempts. Please wait 15 minutes and try again." };
  }

  const supabase = await supabaseServer();
  let verifyFailure: InvitationState["status"];
  if (tokenHash) {
    const { error } = TOKEN_HASH.test(tokenHash) ? await supabase.auth.verifyOtp({ type: "invite", token_hash: tokenHash }) : { error: { code: "invalid" } };
    if (error) verifyFailure = error.code === "otp_expired" ? "expired" : "invalid";
  }

  // Without a fresh token, only a session that was just opened from the invitation email may
  // continue (e.g. the token was already used by an earlier submit of this same form)
  const session = tokenHash && !verifyFailure ? (await supabase.auth.getUser()).data.user : await emailLinkSession();
  if (!session) return { status: verifyFailure ?? "expired" };
  const state: InvitationState = { verified: true, email: session.email ?? undefined };

  const user = await loadUser(session.id);
  if (!user) {
    // No profile, or the account was deactivated after the invitation was sent
    await supabase.auth.signOut();
    return { status: "invalid", error: "This account isn't active. Contact an administrator." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[accept-invitation] password update failed:", error.code ?? error.status);
    const message =
      error.code === "same_password"
        ? "Choose a password you haven't used before."
        : error.code === "weak_password"
          ? "That password is too easy to guess. Try a longer one."
          : "Couldn't save the password. Please try again.";
    return { ...state, error: message };
  }
  // Sign out any other device that used the invitation link
  await supabase.auth.signOut({ scope: "others" });

  await audit(user, "password_change", "user", user.id, "Accepted the invitation and set a password");
  return { ...state, status: "done", redirectTo: user.isStaff ? "/admin" : "/client" };
}
