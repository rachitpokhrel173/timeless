import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Plus } from "lucide-react";
import { adminDb, all, cols, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr, todayISO } from "@/lib/format";
import { first, likeTerm, listParams } from "@/lib/list";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { BOOKING_STATUS, options, StatusBadge } from "@/components/admin/status";
import { ExportLink, Card, EmptyState, Kpi, LinkButton, PageHeader, Pagination, Table, Td, Th, Toolbar } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Bookings" };

const STATUSES = ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
type Ev = { id: string; title: string; eventDate: string; venue: string | null };

export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const user = await requirePage("bookings.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 30);
  const status = str("status");
  const when = str("when");
  const today = todayISO();
  const money = user.permissions.has("payments.view");

  let query = adminDb
    .from(tbl(schema.bookings))
    .select(`${cols(schema.bookings)},customer:customers!inner(id,name),event:events!inner(id,title,eventDate:event_date,venue)`, { count: "exact" });
  if (status && (STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (when === "upcoming") query = query.gte("event.event_date", today).neq("status", "CANCELLED");
  if (when === "past") query = query.lt("event.event_date", today);
  if (q) {
    const term = pgrstValue(likeTerm(q));
    query = query.or(`number.ilike.${term}`);
  }
  const summary = await all<{ id: string; status: string; totalAmount: number; amountPaid: number }>(() =>
    adminDb.from(tbl(schema.bookings)).select("id,status,totalAmount:total_amount,amountPaid:amount_paid").neq("status", "CANCELLED").order("id"),
  );
  // PostgREST can't compare two columns, so "balance outstanding" is resolved to ids first
  if (str("money") === "due") query = query.in("id", summary.filter((b) => b.totalAmount > b.amountPaid).map((b) => b.id));
  const { rows, total } = await paged<Row<typeof schema.bookings> & { customer: { id: string; name: string }; event: Ev | Ev[] }>(
    (when ? query.order("event(event_date)", { ascending: when === "upcoming" }) : query.order("created_at", { ascending: false })).range(offset, offset + pageSize - 1),
  );

  const activeCount = summary.filter((b) => ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(b.status)).length;
  const outstanding = summary.reduce((s, b) => s + Math.max(0, b.totalAmount - b.amountPaid), 0);

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Confirmed work: contract value, advance and balance for every event."
        actions={
          <>
            {money && (
              <ExportLink entity="bookings" />
            )}
            {user.permissions.has("bookings.create") && (
              <LinkButton href="/admin/bookings/new" variant="primary" icon={Plus}>
                New booking
              </LinkButton>
            )}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Active bookings" value={activeCount} href="/admin/bookings?when=upcoming" />
        <Kpi label="Pending confirmation" value={summary.filter((b) => b.status === "PENDING").length} href="/admin/bookings?status=PENDING" />
        {money && <Kpi label="Contract value (active)" value={npr(summary.filter((b) => b.status !== "COMPLETED").reduce((s, b) => s + b.totalAmount, 0))} />}
        {money && <Kpi label="Outstanding" value={npr(outstanding)} href="/admin/bookings?money=due" invert />}
      </div>
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Booking number" />
          <FilterSelect param="status" label="Status" options={options(STATUSES, BOOKING_STATUS)} />
          <FilterSelect
            param="when"
            label="Event"
            allLabel="Any date"
            options={[
              { value: "upcoming", label: "Upcoming" },
              { value: "past", label: "Past" },
            ]}
          />
          {money && <FilterSelect param="money" label="Payment" allLabel="Any" options={[{ value: "due", label: "Balance outstanding" }]} />}
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={CalendarCheck} title={q || status || when ? "No bookings match" : "No bookings yet"}>
            {q || status || when ? "Try a different filter." : "Bookings are created when a quotation is accepted, or directly with “New booking”."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>Customer</Th>
                <Th>Event date</Th>
                <Th>Status</Th>
                {money && <Th className="text-right">Total</Th>}
                {money && <Th className="text-right">Balance</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ev = first(r.event);
                const balance = Math.max(0, r.totalAmount - r.amountPaid);
                const late = balance > 0 && r.balanceDueDate && r.balanceDueDate < today && r.status !== "CANCELLED";
                return (
                  <tr key={r.id} className="hover:bg-a-subtle/60">
                    <Td>
                      <Link href={`/admin/bookings/${r.id}`} className="font-medium hover:underline">
                        {r.number}
                      </Link>
                      <span className="block max-w-64 truncate text-xs text-a-muted">{ev?.title}</span>
                    </Td>
                    <Td>
                      <Link href={`/admin/customers/${r.customer.id}`} className="hover:underline">
                        {r.customer.name}
                      </Link>
                    </Td>
                    <Td className="text-xs">
                      {fmtDate(ev?.eventDate)}
                      <span className="block text-a-muted">{ev?.venue ?? "—"}</span>
                    </Td>
                    <Td>
                      <StatusBadge map={BOOKING_STATUS} value={r.status} />
                    </Td>
                    {money && <Td className="text-right tabular-nums">{npr(r.totalAmount)}</Td>}
                    {money && <Td className={`text-right tabular-nums ${late ? "font-medium text-a-danger" : balance > 0 ? "text-a-warning" : "text-a-muted"}`}>{balance > 0 ? npr(balance) : "Paid"}</Td>}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/bookings" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
