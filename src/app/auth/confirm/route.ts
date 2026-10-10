import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Landing point for Supabase Auth email links (password reset, invitation, email change).
 * Exchanges the one-time token for a session cookie, then continues to `next`.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next") ?? "/admin";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
  const supabase = await supabaseServer();

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (!ok) return NextResponse.redirect(new URL("/admin/login?error=link", url.origin));
  // Invites and recoveries must choose a password before doing anything else
  const destination = type === "invite" || type === "recovery" ? "/admin/reset-password" : safeNext;
  return NextResponse.redirect(new URL(destination, url.origin));
}
