import { resolveSiteUrl } from "@/lib/site-url";

/**
 * Where Supabase Auth emails send people, and which in-app destinations a `next` parameter may
 * point to. Keep these URLs in Supabase → Authentication → URL Configuration → Redirect URLs.
 */

/** Public origin of this deployment, without a trailing slash. */
export const siteOrigin = () => resolveSiteUrl();

export const ACCEPT_INVITATION_PATH = "/admin/accept-invitation";

/** `redirectTo` for supabase.auth.admin.inviteUserByEmail(). */
export const invitationRedirectUrl = () => `${siteOrigin()}${ACCEPT_INVITATION_PATH}`;

/**
 * Accepts only same-site paths under /admin or /client. Rejects protocol-relative URLs and
 * backslashes (browsers treat "/\evil.com" like "//evil.com"), so `next` can't become an open redirect.
 */
export function safeNextPath(next: unknown, fallback = "/admin") {
  if (typeof next !== "string" || next.length > 300) return fallback;
  if (!/^\/(admin|client)(\/|\?|#|$)/.test(next) || next.includes("\\") || next.startsWith("//")) return fallback;
  return next;
}
