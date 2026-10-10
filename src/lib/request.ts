import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/** Client IP as reported by the hosting proxy. */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function clientUserAgent() {
  return (await headers()).get("user-agent")?.slice(0, 400) ?? null;
}

/** One-way, salted IP fingerprint for rate limiting without storing raw IPs. */
export function hashIp(ip: string | null) {
  if (!ip) return null;
  return createHash("sha256").update(`${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}:${ip}`).digest("hex").slice(0, 32);
}

export function deviceFromUserAgent(ua: string | null) {
  if (!ua) return null;
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}
