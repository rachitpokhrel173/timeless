import { NextResponse } from "next/server";
import { adminDb, schema, tbl } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { headerCounts } from "@/server/counts";

/** Badge counts for the admin header and sidebar, polled every 30 seconds. */
export async function GET() {
  // Server-Timing (visible in the browser's network panel) shows where the request time goes
  const t0 = performance.now();
  const supabase = await supabaseServer();
  await supabase.auth.getClaims().catch(() => null);
  const t1 = performance.now();
  await adminDb.from(tbl(schema.roles)).select("key").limit(1);
  const t2 = performance.now();
  const user = await getCurrentUser();
  const t3 = performance.now();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const counts = await headerCounts(user);
  const t4 = performance.now();
  const ms = (a: number, b: number) => (b - a).toFixed(1);
  return NextResponse.json(counts, {
    headers: { "Server-Timing": `claims;dur=${ms(t0, t1)}, ping;dur=${ms(t1, t2)}, user;dur=${ms(t2, t3)}, counts;dur=${ms(t3, t4)}, total;dur=${ms(t0, t4)}` },
  });
}
