import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { toCsv } from "@/lib/csv";
import { resolveRange } from "@/server/metrics";
import { buildReport, REPORTS } from "@/server/reports";

/** CSV export of any report on the Reports page, for the same date range. */
export async function GET(req: NextRequest, { params }: RouteContext<"/api/admin/reports/[report]">) {
  const { report } = await params;
  const def = REPORTS.find((r) => r.key === report);
  if (!def) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user?.isStaff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.has("reports.view") || !user.permissions.has(def.permission)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const range = resolveRange(Object.fromEntries(req.nextUrl.searchParams), "12m");
  const r = await buildReport(report, range);
  if (!r) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  await audit(user, "export", "report", report, `Exported the ${r.title} report (${range.from} – ${range.to})`);
  const csv = toCsv(
    r.columns.map((c) => c.label),
    r.rows.map((row) => row.map((v, i) => (r.columns[i]?.format === "percent" && typeof v === "number" ? Math.round(v * 10) / 10 : typeof v === "number" ? Math.round(v * 100) / 100 : v))),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report}-${range.from}-to-${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
