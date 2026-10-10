import type { Metadata } from "next";
import Link from "next/link";
import { Download, TrendingDown } from "lucide-react";
import { adminDb, all, cols, many, paged, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr, todayISO } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { PAYMENT_METHODS } from "@/server/finance";
import { expenseCategoryOptions, vendorOptions } from "@/server/lookups";
import { BarList } from "@/components/admin/charts";
import { DateRangeFilter, FilterSelect, SearchBox } from "@/components/admin/interactive";
import { label } from "@/components/admin/status";
import { Badge, buttonClass, Card, EmptyState, Kpi, PageHeader, Pagination, Table, Td, Th, Toolbar } from "@/components/admin/ui";
import { ExpenseButton, VoidExpenseButton } from "./ExpenseClient";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: PageProps<"/admin/expenses">) {
  const user = await requirePage("expenses.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 40);
  const today = todayISO();
  const from = str("from") ?? `${today.slice(0, 8)}01`;
  const to = str("to") ?? today;

  let query = adminDb
    .from(tbl(schema.expenses))
    .select(`${cols(schema.expenses)},cat:expense_categories!inner(name),vendor:vendors(id,name),event:events(id,title)`, { count: "exact" })
    .gte("date", from)
    .lte("date", to);
  if (str("show") === "void") query = query.not("voided_at", "is", null);
  else query = query.is("voided_at", null);
  if (str("category")) query = query.eq("category_id", str("category")!);
  if (str("kind") === "vendor") query = query.not("vendor_assignment_id", "is", null);
  if (q) query = query.ilike("description", likeTerm(q));

  const [{ rows, total }, categories, vendors, inRange, events, vendorBookings] = await Promise.all([
    paged<Row<typeof schema.expenses> & { cat: { name: string }; vendor: { id: string; name: string } | null; event: { id: string; title: string } | null }>(
      query.order("date", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1),
    ),
    expenseCategoryOptions(),
    vendorOptions(),
    all<{ amount: number; cat: { name: string } }>(() => adminDb.from(tbl(schema.expenses)).select("amount,cat:expense_categories!inner(name)").is("voided_at", null).gte("date", from).lte("date", to).order("id")),
    many<{ value: string; label: string; date: string }>(adminDb.from(tbl(schema.events)).select("value:id,label:title,date:event_date").gte("event_date", todayISO(-120)).order("event_date", { ascending: false }).limit(150)),
    many<{ value: string; service: string; cost: number; v: { name: string }; e: { title: string } }>(
      adminDb.from(tbl(schema.vendorAssignments)).select("value:id,service,cost,v:vendors!inner(name),e:events!inner(title)").in("status", ["REQUESTED", "CONFIRMED", "COMPLETED"]).order("created_at", { ascending: false }).limit(150),
    ),
  ]);
  const byCategory = new Map<string, number>();
  for (const e of inRange) byCategory.set(e.cat.name, (byCategory.get(e.cat.name) ?? 0) + e.amount);
  const spent = inRange.reduce((s, e) => s + e.amount, 0);
  const methods = PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }));

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Money spent running events and the business — including vendor payments."
        actions={
          <>
            <a href={`/api/admin/export/expenses?from=${from}&to=${to}`} className={buttonClass("secondary")}>
              <Download className="size-4" aria-hidden /> Export CSV
            </a>
            {user.permissions.has("expenses.create") && (
              <ExpenseButton
                categories={categories}
                vendors={vendors}
                events={events.map((e) => ({ value: e.value, label: `${fmtDate(e.date)} — ${e.label}` }))}
                vendorBookings={vendorBookings.map((v) => ({ value: v.value, label: `${v.v.name} · ${v.service} (${v.e.title}) — ${npr(v.cost)}` }))}
                methods={methods}
              />
            )}
          </>
        }
      />
      <div className="mb-5 grid gap-4 lg:grid-cols-[260px_1fr]">
        <Kpi label={`Spent ${fmtDate(from)} – ${fmtDate(to)}`} value={npr(spent)} hint={`${inRange.length} expense${inRange.length === 1 ? "" : "s"}`} />
        <Card title="By category">
          <BarList ariaLabel="Expenses by category" format="npr" items={[...byCategory].map(([label, value]) => ({ label, value }))} empty="No expenses in this period." />
        </Card>
      </div>
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Search descriptions" />
          <FilterSelect param="category" label="Category" options={categories} />
          <FilterSelect param="kind" label="Type" allLabel="All" options={[{ value: "vendor", label: "Vendor payments" }]} />
          <FilterSelect param="show" label="Show" allLabel="Valid" options={[{ value: "void", label: "Voided" }]} />
          <DateRangeFilter />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={TrendingDown} title="No expenses in this period" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th>Vendor / event</Th>
                <Th>Method</Th>
                <Th className="text-right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className={e.voidedAt ? "text-a-muted" : "hover:bg-a-subtle/60"}>
                  <Td className="whitespace-nowrap">{fmtDate(e.date)}</Td>
                  <Td>
                    <span className={e.voidedAt ? "line-through" : "font-medium"}>{e.description}</span>
                    {e.vendorAssignmentId && (
                      <Badge tone="gold" className="ml-1.5">
                        Vendor payment
                      </Badge>
                    )}
                  </Td>
                  <Td>{e.cat.name}</Td>
                  <Td className="text-xs">
                    {e.vendor && (
                      <Link href={`/admin/vendors/${e.vendor.id}`} className="block hover:underline">
                        {e.vendor.name}
                      </Link>
                    )}
                    {e.event && (
                      <Link href={`/admin/events/${e.event.id}?tab=profit`} className="block text-a-muted hover:underline">
                        {e.event.title}
                      </Link>
                    )}
                    {!e.vendor && !e.event && "—"}
                  </Td>
                  <Td>{label(e.method)}</Td>
                  <Td className={`text-right font-medium tabular-nums ${e.voidedAt ? "line-through" : ""}`}>{npr(e.amount)}</Td>
                  <Td className="text-right">{user.permissions.has("expenses.create") && <VoidExpenseButton id={e.id} voided={!!e.voidedAt} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/expenses" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
