import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { headerCounts } from "@/server/counts";

/** Badge counts for the admin header and sidebar, polled every 30 seconds. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await headerCounts(user));
}
