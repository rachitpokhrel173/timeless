import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { adminDb, all, cols, paged, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr, todayISO } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { INVOICE_STATUS, options, StatusBadge } from "@/components/admin/status";
import { ExportLink, Card, EmptyState, Kpi, PageHeader, Pagination, Table, Td, Th, Toolbar } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Invoices" };

const STATUSES = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"] as const;

export default async function InvoicesPage({ searchParams }: PageProps<"/admin/invoices">) {
  await requirePage("invoices.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 30);
  const status = str("status");
  const today = todayISO();

  let query = adminDb.from(tbl(schema.invoices)).select(`${cols(schema.invoices)},customer:customers!inner(id,name),booking:bookings!inner(id,number)`, { count: "exact" });
  if (status === "open") query = query.in("status", ["SENT", "PARTIALLY_PAID", "OVERDUE"]);
  else if (status && (STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (q) query = query.ilike("number", likeTerm(q));
  const { rows, total } = await paged<Row<typeof schema.invoices> & { customer: { id: string; name: string }; booking: { id: string; number: string } }>(
    query.order("issue_date", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1),
  );
  const summary = await all<{ status: string; total: number; amountPaid: number; dueDate: string | null }>(() =>
    adminDb.from(tbl(schema.invoices)).select("status,total,amountPaid:amount_paid,dueDate:due_date").neq("status", "CANCELLED").order("id"),
  );
  const open = summary.filter((i) => ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(i.status));
  const due = (list: typeof summary) => list.reduce((s, i) => s + Math.max(0, i.total - i.amountPaid), 0);
  const overdue = open.filter((i) => i.status === "OVERDUE" || (i.dueDate && i.dueDate < today));

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Bills issued against bookings. Create an invoice from the booking's Invoices tab."
        actions={
          <ExportLink entity="invoices" />
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open invoices" value={open.length} href="/admin/invoices?status=open" />
        <Kpi label="Outstanding" value={npr(due(open))} invert />
        <Kpi label="Overdue" value={npr(due(overdue))} hint={`${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`} href="/admin/invoices?status=OVERDUE" invert />
        <Kpi label="Drafts" value={summary.filter((i) => i.status === "DRAFT").length} href="/admin/invoices?status=DRAFT" />
      </div>
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Invoice number" />
          <FilterSelect param="status" label="Status" options={[{ value: "open", label: "Open (unpaid)" }, ...options(STATUSES, INVOICE_STATUS)]} />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices found">
            Open a booking and use “Create invoice”.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const balance = Math.max(0, i.total - i.amountPaid);
                const late = balance > 0 && i.dueDate && i.dueDate < today && i.status !== "CANCELLED";
                return (
                  <tr key={i.id} className="hover:bg-a-subtle/60">
                    <Td>
                      <Link href={`/admin/invoices/${i.id}`} className="font-medium hover:underline">
                        {i.number}
                      </Link>
                      <Link href={`/admin/bookings/${i.booking.id}`} className="block text-xs text-a-muted hover:underline">
                        {i.booking.number}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/admin/customers/${i.customer.id}`} className="hover:underline">
                        {i.customer.name}
                      </Link>
                    </Td>
                    <Td>{fmtDate(i.issueDate)}</Td>
                    <Td className={late ? "font-medium text-a-danger" : undefined}>{fmtDate(i.dueDate)}</Td>
                    <Td>
                      <StatusBadge map={INVOICE_STATUS} value={i.status} />
                    </Td>
                    <Td className="text-right tabular-nums">{npr(i.total)}</Td>
                    <Td className="text-right font-medium tabular-nums">{i.status === "CANCELLED" ? "—" : npr(balance)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/invoices" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
