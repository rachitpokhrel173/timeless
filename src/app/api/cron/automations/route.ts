import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runScheduledAutomations } from "@/server/automation";

/**
 * Daily automation sweep. Call with `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron does this automatically when CRON_SECRET is set — see vercel.json).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const ran = await runScheduledAutomations();
    return NextResponse.json({ ok: true, ran });
  } catch (error) {
    console.error("[cron] automations failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
