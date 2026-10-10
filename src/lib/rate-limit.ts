import "server-only";
import { adminDb, rpc } from "@/db";

/**
 * Fixed-window limiter backed by public.hit_rate_limit(), so it works across serverless
 * instances. Returns true when the call is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  return rpc<boolean>(adminDb, "hit_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
}
