import { NextResponse } from "next/server";

/** Files are served by Supabase Storage directly (public URLs and signed URLs); this old local-disk route is unused. */
export function GET() {
  return new NextResponse("Not found", { status: 404 });
}
