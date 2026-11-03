import type { Metadata } from "next";
import Link from "@/components/admin/Link";
import { Download, Paperclip, TrendingDown } from "lucide-react";
import { adminDb, all, cols, many, maybe, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr, todayISO } from "@/lib/format";
import { isUuid, likeTerm, listParams } from "@/lib/list";
import { methodLabel, methodOptions } from "@/lib/finance";
import { expenseCategoryOptions, vendorOptions } from "@/server/lookups";
import { signedUrl } from "@/server/storage";
import { BarList, ColumnChart } from "@/components/admin/charts";
import UploadButton from "@/components/admin/Upload";
import { DateRangeFilter, FilterSelect, SearchBox } from "@/components/admin/interactive";
import { Badge, buttonClass, Card, EmptyState, Kpi, Notice, PageHeader, Pagination, Table, Td, Th, Toolbar } from "@/components/admin/ui";
import { uploadExpenseReceipt } from "../upload-actions";
import { EditExpenseButton, ExpenseButton, VoidExpenseButton, type ExpenseOptions } from "./ExpenseClient";

export const metadata: Metadata = { title: "Expenses" };

type ExpenseRow = Row<typeof schema.expenses> & {
  cat: { name: string };
  vendor: { id: string; name: string } | null;
  event: { id: string; title: string } | null;
  booking: { id: string; number: string } | null;
  editor: { fullName: string } | null;
};

type Filterable = { eq(c: string, v: string): Filterable; is(c: string, v: null): Filterable; not(c: string, op: string, v: null): Filterable };

const monthKey =(d: string) => d.slice(0, 7);
const monthName = (k: string) => new Date(`${k}-01T00:00:00`).toLocaleString("en", { month: "short" });

export default async function ExpensesPage({ searchParams }: PageProps<"/admin/expenses">) {
  const user = await requirePage("expenses.view");
  const canEdit = user.permissions.has("expenses.create");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 40);
  const today = todayISO();
  const monthStart = `${today.slice(0, 8)}01`;
  const eventFilter = isUuid(str("event") ?? "") ? str("event")! : null;
  const bookingFilter = isUuid(str("booking") ?? "") ? str("booking")! : null;
  // Opening an event's or booking's expenses shows all of them, not just this month's.
  const from = str("from") ?? (eventFilter || bookingFilter ? "2000-01-01" : monthStart);
  const to = str("to") ?? today;
  const kind = str("kind");

  /** The same filters for the page rows and the totals. */
  function filtered<Q>(query: Q): Q {
    let x = query as unknown as Filterable;
    if (str("category")) x = x.eq("category_id", str("category")!);
    if (eventFilter) x = x.eq("event_id", eventFilter);
    if (bookingFilter) x = x.eq("booking_id", bookingFilter);
    if (kind === "vendor") x = x.not("vendor_assignment_id", "is", null);
    if (kind === "event") x = x.not("event_id", "is", null);
    if (kind === "general") x = x.is("event_id", null).is("booking_id", null);
    return x as unknown as Q;
  }

  let query = adminDb
    .from(tbl(schema.expenses))
    .select(
      `${cols(schema.expenses)},cat:expense_categories!inner(name),vendor:vendors(id,name),event:events(id,title),booking:bookings(id,number),editor:profiles!expenses_updated_by_profiles_id_fk(fullName:full_name)`,
      { count: "exact" },
    )
    .gte("date", from)
    .lte("date", to);
  if (str("show") === "void") query = query.not("voided_at", "is", null);
  else query = query.is("voided_at", null);
  query = filtered(query);
  if (q) {
    const t = pgrstValue(likeTerm(q));
    query = query.or(`description.ilike.${t},payee.ilike.${t}`);
  }

  const yearAgo = `${new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 12, 1)).toISOString().slice(0, 7)}-01`;
  const [{ rows, total }, categories, vendors, inRange, year, events, bookings, vendorBookings, scope] = await Promise.all([
    paged<ExpenseRow>(query.order("date", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1)),
    expenseCategoryOptions(),
    vendorOptions(),
    all<{ amount: number; eventId: string | null; bookingId: string | null; vendorAssignmentId: string | null; cat: { name: string } }>(() =>
      filtered(
        adminDb
          .from(tbl(schema.expenses))
          .select("amount,eventId:event_id,bookingId:booking_id,vendorAssignmentId:vendor_assignment_id,cat:expense_categories!inner(name)")
          .is("voided_at", null)
          .gte("date", from)
          .lte("date", to),
      ).order("id"),
    ),
    all<{ amount: number; date: string }>(() => adminDb.from(tbl(schema.expenses)).select("amount,date").is("voided_at", null).gte("date", yearAgo).order("id")),
    many<{ value: string; label: string; date: string }>(adminDb.from(tbl(schema.events)).select("value:id,label:title,date:event_date").gte("event_date", todayISO(-180)).order("event_date", { ascending: false }).limit(200)),
    canEdit
      ? many<{ id: string; number: string; c: { name: string }; e: { title: string; eventDate: string }[] }>(
          adminDb.from(tbl(schema.bookings)).select("id,number,c:customers!inner(name),e:events(title,eventDate:event_date)").neq("status", "CANCELLED").order("created_at", { ascending: false }).limit(200),
        )
      : [],
    canEdit
      ? many<{ value: string; service: string; cost: number; v: { name: string }; e: { title: string } }>(
          adminDb.from(tbl(schema.vendorAssignments)).select("value:id,service,cost,v:vendors!inner(name),e:events!inner(title)").in("status", ["REQUESTED", "CONFIRMED", "COMPLETED"]).order("created_at", { ascending: false }).limit(150),
        )
      : [],
    eventFilter
      ? maybe<{ label: string }>(adminDb.from(tbl(schema.events)).select("label:title").eq("id", eventFilter))
      : bookingFilter
        ? maybe<{ label: string }>(adminDb.from(tbl(schema.bookings)).select("label:number").eq("id", bookingFilter))
        : null,
  ]);
  const receipts = new Map(
    await Promise.all(rows.filter((e) => e.receiptPath).map(async (e) => [e.id, await signedUrl("private-documents", e.receiptPath!, 600).catch(() => null)] as const)),
  );

  const byCategory = new Map<string, number>();
  for (const e of inRange) byCategory.set(e.cat.name, (byCategory.get(e.cat.name) ?? 0) + e.amount);
  const spent = inRange.reduce((s, e) => s + e.amount, 0);
  const eventSpend = inRange.filter((e) => e.eventId || e.bookingId).reduce((s, e) => s + e.amount, 0);
  const vendorSpend = inRange.filter((e) => e.vendorAssignmentId).reduce((s, e) => s + e.amount, 0);
  const thisMonth = year.filter((e) => e.date >= monthStart).reduce((s, e) => s + e.amount, 0);
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) months.push(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 - i, 1)).toISOString().slice(0, 7));
  const monthly = new Map<string, number>(months.map((m) => [m, 0]));
  for (const e of year) if (monthly.has(monthKey(e.date))) monthly.set(monthKey(e.date), monthly.get(monthKey(e.date))! + e.amount);

  const opts: ExpenseOptions = {
    categories,
    vendors,
    events: events.map((e) => ({ value: e.value, label: `${fmtDate(e.date)} — ${e.label}` })),
    bookings: bookings.map((b) => ({ value: b.id, label: `${b.number} — ${b.c.name}${b.e[0] ? ` (${b.e[0].title}, ${fmtDate(b.e[0].eventDate)})` : ""}` })),
    vendorBookings: vendorBookings.map((v) => ({ value: v.value, label: `${v.v.name} · ${v.service} (${v.e.title}) — ${npr(v.cost)}` })),
    methods: methodOptions(),
  };
  // Editing an older expense: keep its own event/booking selectable even if outside the recent lists.
  const withOwn = (e: ExpenseRow): ExpenseOptions => ({
    ...opts,
    events: e.event && !opts.events.some((o) => o.value === e.event!.id) ? [{ value: e.event.id, label: e.event.title }, ...opts.events] : opts.events,
    bookings: e.booking && !opts.bookings.some((o) => o.value === e.booking!.id) ? [{ value: e.booking.id, label: e.booking.number }, ...opts.bookings] : opts.bookings,
    methods: opts.methods.some((m) => m.value === e.method) ? opts.methods : [...opts.methods, { value: e.method, label: methodLabel(e.method) }],
  });

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Money spent running events and the business — general or tied to a booking/event, including vendor payments."
        actions={
          <>
            <a href={`/api/admin/export/expenses?from=${from}&to=${to}`} className={buttonClass("secondary")}>
              <Download className="size-4" aria-hidden /> Export CSV
            </a>
            {canEdit && <ExpenseButton opts={opts} defaults={eventFilter ? { eventId: eventFilter } : undefined} />}
          </>
        }
      />
      {scope && (
        <div className="mb-4">
          <Notice tone="info" title={`Showing expenses for ${eventFilter ? "event" : "booking"} “${scope.label}”`}>
            <Link href="/admin/expenses" className="underline">
              Show all expenses
            </Link>
          </Notice>
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={str("from") || !scope ? `Spent ${fmtDate(from)} – ${fmtDate(to)}` : "Spent (all time)"} value={npr(spent)} hint={`${inRange.length} expense${inRange.length === 1 ? "" : "s"}`} />
        <Kpi label="This month" value={npr(thisMonth)} hint="all categories" />
        <Kpi label="Event / booking expenses" value={npr(eventSpend)} hint={`${npr(spent - eventSpend)} general`} />
        <Kpi label="Vendor payments" value={npr(vendorSpend)} hint="in this period" />
      </div>
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card title="By category">
          <BarList ariaLabel="Expenses by category" format="npr" items={[...byCategory].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} empty="No expenses in this period." />
        </Card>
        <Card title="Monthly expenses" description="Last 12 months, all categories">
          <ColumnChart labels={months.map(monthName)} series={[{ name: "Spent", values: months.map((m) => monthly.get(m) ?? 0) }]} format="npr" ariaLabel="Expenses by month" />
        </Card>
      </div>
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Search description or payee" />
          <FilterSelect param="category" label="Category" options={categories} />
          <FilterSelect
            param="kind"
            label="Type"
            allLabel="All"
            options={[
              { value: "event", label: "Event / booking" },
              { value: "general", label: "General" },
              { value: "vendor", label: "Vendor payments" },
            ]}
          />
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
                <Th>Paid to</Th>
                <Th>Booking / event</Th>
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
                    {e.updatedAt && (
                      <span className="block text-xs text-a-muted">
                        Edited {fmtDateTime(e.updatedAt)}
                        {e.editor ? ` by ${e.editor.fullName}` : ""}
                      </span>
                    )}
                  </Td>
                  <Td>{e.cat.name}</Td>
                  <Td className="text-xs">
                    {e.payee ?? (e.vendor ? null : "—")}
                    {e.vendor && (
                      <Link href={`/admin/vendors/${e.vendor.id}`} className="block hover:underline">
                        {e.vendor.name}
                      </Link>
                    )}
                  </Td>
                  <Td className="text-xs">
                    {e.booking && (
                      <Link href={`/admin/bookings/${e.booking.id}`} className="block hover:underline">
                        {e.booking.number}
                      </Link>
                    )}
                    {e.event && (
                      <Link href={`/admin/events/${e.event.id}?tab=finance`} className="block text-a-muted hover:underline">
                        {e.event.title}
                      </Link>
                    )}
                    {!e.booking && !e.event && <span className="text-a-muted">General</span>}
                  </Td>
                  <Td>{methodLabel(e.method)}</Td>
                  <Td className={`text-right font-medium tabular-nums ${e.voidedAt ? "line-through" : ""}`}>{npr(e.amount)}</Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center gap-1">
                      {receipts.get(e.id) && (
                        <a href={receipts.get(e.id)!} target="_blank" rel="noreferrer" className={buttonClass("ghost", "icon-sm")} aria-label="Open receipt" title="Open receipt">
                          <Paperclip className="size-4" aria-hidden />
                        </a>
                      )}
                      {canEdit && !e.voidedAt && (
                        <>
                          <UploadButton action={uploadExpenseReceipt} fields={{ expenseId: e.id }} label={e.receiptPath ? "Replace receipt" : "Attach receipt"} size="sm" accept="image/*,application/pdf" success="Receipt attached" />
                          <EditExpenseButton
                            opts={withOwn(e)}
                            values={{
                              id: e.id,
                              categoryId: e.categoryId,
                              description: e.description,
                              amount: e.amount,
                              date: e.date,
                              payee: e.payee,
                              vendorId: e.vendorId,
                              vendorAssignmentId: e.vendorAssignmentId,
                              bookingId: e.bookingId,
                              eventId: e.eventId,
                              method: e.method,
                              notes: e.notes,
                            }}
                          />
                        </>
                      )}
                      {canEdit && <VoidExpenseButton id={e.id} voided={!!e.voidedAt} />}
                    </span>
                  </Td>
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
