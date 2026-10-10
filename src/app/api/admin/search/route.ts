import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { globalSearch } from "@/server/search";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await globalSearch(user, q) });
  } catch (error) {
    console.error("[search]", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
