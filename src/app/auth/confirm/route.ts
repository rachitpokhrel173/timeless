import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { ACCEPT_INVITATION_PATH, safeNextPath } from "@/lib/auth/redirects";
import { supabaseServer } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Landing point for Supabase Auth email links (password reset, email change, and invitations
 * sent before /admin/accept-invitation existed). Exchanges the one-time token for a session
 * cookie, then continues to `next` (only /admin or /client paths).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const type = OTP_TYPES.includes(rawType as EmailOtpType) ? (rawType as EmailOtpType) : null;
  const code = url.searchParams.get("code");

  // Invitations are verified on the acceptance page when the password is submitted
  if (type === "invite" && tokenHash) {
    const target = new URL(ACCEPT_INVITATION_PATH, url.origin);
    target.searchParams.set("token_hash", tokenHash);
    target.searchParams.set("type", "invite");
    return NextResponse.redirect(target);
  }

  // No token in the query: the link (Supabase's default email template) carries the session or
  // an error in the URL fragment, which only the browser can read. The browser keeps the
  // fragment across this redirect, and the acceptance page reads it.
  if (!tokenHash && !code) return NextResponse.redirect(new URL(ACCEPT_INVITATION_PATH, url.origin));

  const supabase = await supabaseServer();
  let ok = false;
  try {
    if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
    else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } catch {
    ok = false;
  }

  if (!ok) return NextResponse.redirect(new URL("/admin/login?error=link", url.origin));
  // Recoveries must choose a password before doing anything else
  const destination = type === "recovery" ? "/admin/reset-password" : next;
  return NextResponse.redirect(new URL(destination, url.origin));
}
