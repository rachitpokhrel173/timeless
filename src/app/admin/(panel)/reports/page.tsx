import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Download } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr, num } from "@/lib/format";
import { listParams } from "@/lib/list";
import { cn } from "@/lib/utils";
import { monthlyRevenue, resolveRange } from "@/server/metrics";
import { buildReport, REPORTS, type ColumnFormat } from "@/server/reports";
import { BarList, ColumnChart } from "@/components/admin/charts";
import PrintButton from "@/components/documents/PrintButton";
import RangeFilter from "@/components/admin/RangeFilter";
import { buttonClass, Card, EmptyState, Kpi, PageHeader, Table, Td, Th } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Reports" };

const show = (v: string | number | null, f: ColumnFormat) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return f === "date" ? fmtDate(v) : v;
  if (f === "npr") return npr(v);
  if (f === "percent") return `${Math.round(v)}%`;
  return num(v);
};

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const user = await requirePage("reports.view");
  const sp = await searchParams;
  const { str } = listParams(sp);
  const available = REPORTS.filter((r) => user.permissions.has(r.permission));
  const key = available.find((r) => r.key === str("report"))?.key ?? available[0]?.key ?? "sales";
  const range = resolveRange(sp, "12m");
  const [report, months] = await Promise.all([buildReport(key, range), user.permissions.has("payments.view") && key === "revenue" ? monthlyRevenue(12) : null]);
  const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "report"));
  const groups = [...new Set(available.map((r) => r.group))];

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Live figures from your records · ${fmtDate(range.from)} – ${fmtDate(range.to)}`}
        actions={
          <>
            <RangeFilter fallback="12m" />
            <a href={`/api/admin/reports/${key}?${qs}`} className={buttonClass("secondary")}>
              <Download className="size-4" aria-hidden /> CSV
            </a>
            <PrintButton label="Print" className={buttonClass("secondary", "md", "print:hidden")} />
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Reports" className="print:hidden">
          {groups.map((g) => (
            <div key={g} className="mb-4">
              <p className="mb-1 px-2 text-[11px] font-semibold tracking-[0.14em] text-a-muted uppercase">{g}</p>
              <ul className="space-y-0.5">
                {available
                  .filter((r) => r.group === g)
                  .map((r) => (
                    <li key={r.key}>
                      <Link
                        href={`/admin/reports?${new URLSearchParams({ ...Object.fromEntries(qs), report: r.key })}`}
                        aria-current={r.key === key ? "page" : undefined}
                        className={cn("block rounded-md px-2 py-1.5 text-[13px]", r.key === key ? "bg-a-accent-soft font-medium text-a-accent" : "text-a-muted hover:bg-a-hover hover:text-a-text")}
                      >
                        {r.label}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          {!report ? (
            <Card>
              <EmptyState icon={BarChart3} title="Report not available" />
            </Card>
          ) : (
            <>
              <div>
                <h2 className="font-serif text-2xl font-medium">{report.title}</h2>
                <p className="text-[13px] text-a-muted">{report.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {report.summary.map((s) => (
                  <Kpi key={s.label} label={s.label} value={show(s.value, s.format)} />
                ))}
              </div>
              {months && (
                <Card title="Received vs spent — last 12 months">
                  <ColumnChart
                    ariaLabel="Revenue and expenses by month"
                    format="nprCompact"
                    labels={months.map((m) => m.label)}
                    series={[
                      { name: "Received", values: months.map((m) => m.revenue) },
                      { name: "Spent", values: months.map((m) => m.expenses) },
                    ]}
                  />
                </Card>
              )}
              {report.chart && report.rows.length > 0 && (
                <Card>
                  <BarList ariaLabel={report.title} format={report.chart.format} max={10} items={report.rows.map((r) => ({ label: String(r[report.chart!.label] ?? "—"), value: Number(r[report.chart!.value] ?? 0) }))} />
                </Card>
              )}
              <Card bodyClassName="p-0">
                {report.rows.length === 0 ? (
                  <EmptyState compact title="No data for this period" />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        {report.columns.map((c) => (
                          <Th key={c.label} className={c.format === "text" || c.format === "date" ? undefined : "text-right"}>
                            {c.label}
                          </Th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((v, j) => (
                            <Td key={j} className={cn(report.columns[j]!.format !== "text" && report.columns[j]!.format !== "date" && "text-right tabular-nums", j === 0 && "font-medium")}>
                              {show(v, report.columns[j]!.format)}
                            </Td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
