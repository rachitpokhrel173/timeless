import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

let client: ReturnType<typeof createClient> | undefined;

/**
 * Service-role client: bypasses RLS. SERVER ONLY — the "server-only" import above makes the
 * build fail if a client component ever imports this file. Used for creating/inviting users,
 * signed URLs for private files and storage uploads after a server-side permission check.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server.");
  client ??= createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export const serviceRoleConfigured = () => !!(SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
