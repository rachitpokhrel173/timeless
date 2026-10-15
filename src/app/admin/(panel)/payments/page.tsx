import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import { adminDb, all, cols, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr, todayISO } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { PAYMENT_METHODS } from "@/server/finance";
import { DateRangeFilter, FilterSelect, SearchBox } from "@/components/admin/interactive";
import { label } from "@/components/admin/status";
import { Badge, ExportLink, Card, EmptyState, Kpi, LinkButton, PageHeader, Pagination, Table, Td, Th, Toolbar } from "@/components/admin/ui";
import { VoidPaymentButton } from "../bookings/BookingClient";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const user = await requirePage("payments.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 40);
  const from = str("from");
  const to = str("to");
  const today = todayISO();
  const monthStart = `${today.slice(0, 8)}01`;

  let query = adminDb
    .from(tbl(schema.payments))
    .select(`${cols(schema.payments)},customer:customers!inner(id,name),booking:bookings!inner(id,number),inv:invoices(id,number)`, { count: "exact" });
  if (str("method") && (PAYMENT_METHODS as readonly string[]).includes(str("method")!)) query = query.eq("method", str("method")!);
  if (str("show") === "void") query = query.not("voided_at", "is", null);
  else query = query.is("voided_at", null);
  if (from) query = query.gte("paid_at", from);
  if (to) query = query.lte("paid_at", to);
  if (q) {
    const term = pgrstValue(likeTerm(q));
    query = query.or(`number.ilike.${term},reference.ilike.${term}`);
  }
  const { rows, total } = await paged<Row<typeof schema.payments> & { customer: { id: string; name: string }; booking: { id: string; number: string }; inv: { id: string; number: string } | null }>(
    query.order("paid_at", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1),
  );
  const recent = await all<{ amount: number; paidAt: string }>(() =>
    adminDb.from(tbl(schema.payments)).select("amount,paidAt:paid_at").is("voided_at", null).gte("paid_at", `${String(Number(today.slice(0, 4)) - 1)}${today.slice(4, 8)}01`).order("id"),
  );
  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);
  const lastMonthStart = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every amount received from clients. Booking and invoice balances update automatically."
        actions={
          <>
            <ExportLink entity="payments" />
            {user.permissions.has("payments.create") && (
              <LinkButton href="/admin/payments/new" variant="primary" icon={Plus}>
                Record payment
              </LinkButton>
            )}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="This month" value={npr(sum(recent.filter((p) => p.paidAt >= monthStart)))} />
        <Kpi label="Last month" value={npr(sum(recent.filter((p) => p.paidAt >= lastMonthStart && p.paidAt < monthStart)))} />
        <Kpi label="Last 12 months" value={npr(sum(recent))} />
      </div>
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Receipt no. or reference" />
          <FilterSelect param="method" label="Method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }))} />
          <FilterSelect param="show" label="Show" allLabel="Valid" options={[{ value: "void", label: "Voided" }]} />
          <DateRangeFilter />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments found">
            Payments are recorded on a booking.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Booking</Th>
                <Th>Method</Th>
                <Th className="text-right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-a-subtle/60">
                  <Td>
                    <span className="font-medium">{p.number}</span>
                    {p.reference && <span className="block text-xs text-a-muted">{p.reference}</span>}
                  </Td>
                  <Td>{fmtDate(p.paidAt)}</Td>
                  <Td>
                    <Link href={`/admin/customers/${p.customer.id}`} className="hover:underline">
                      {p.customer.name}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/admin/bookings/${p.booking.id}?tab=payments`} className="hover:underline">
                      {p.booking.number}
                    </Link>
                    {p.inv && (
                      <Link href={`/admin/invoices/${p.inv.id}`} className="block text-xs text-a-muted hover:underline">
                        {p.inv.number}
                      </Link>
                    )}
                  </Td>
                  <Td>{label(p.method)}</Td>
                  <Td className={`text-right font-medium tabular-nums ${p.voidedAt ? "text-a-muted line-through" : ""}`}>{npr(p.amount)}</Td>
                  <Td className="text-right">{p.voidedAt ? <Badge tone="danger">Void</Badge> : user.permissions.has("payments.create") && <VoidPaymentButton id={p.id} number={p.number} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/payments" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
