import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Contact, Plus } from "lucide-react";
import { adminDb, all, cols, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { sourceOptions } from "@/server/lookups";
import { BulkTable, FilterSelect, SearchBox } from "@/components/admin/interactive";
import { Badge, ExportLink, Card, EmptyState, LinkButton, PageHeader, Pagination, Tabs, Toolbar } from "@/components/admin/ui";
import ImportButton from "../ImportButton";
import { bulkArchiveCustomers } from "./actions";

export const metadata: Metadata = { title: "Customers" };


export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const user = await requirePage("customers.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 30);
  const archived = !!str("archived");
  const sources = await sourceOptions();

  let query = adminDb.from(tbl(schema.customers)).select(cols(schema.customers), { count: "exact" }).is("deleted_at", null);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (q) {
    const term = pgrstValue(likeTerm(q));
    query = query.or(["name", "phone", "email", "address"].map((col) => `${col}.ilike.${term}`).join(","));
  }
  if (str("source")) query = query.eq("source_key", str("source")!);
  if (str("type") === "portal") query = query.not("auth_user_id", "is", null);
  if (str("type") === "returning") {
    const booked = await all<{ customerId: string }>(() => adminDb.from(tbl(schema.bookings)).select("customerId:customer_id").neq("status", "CANCELLED").order("id"));
    const perCustomer = new Map<string, number>();
    for (const b of booked) perCustomer.set(b.customerId, (perCustomer.get(b.customerId) ?? 0) + 1);
    query = query.in(
      "id",
      [...perCustomer].filter(([, n]) => n > 1).map(([id]) => id),
    );
  }
  const { rows: page_, total } = await paged<Row<typeof schema.customers>>(query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1));
  const ids = page_.map((x) => x.id);
  const [bookings, payments, events] = ids.length
    ? await Promise.all([
        all<{ customerId: string; totalAmount: number; amountPaid: number }>(() =>
          adminDb.from(tbl(schema.bookings)).select("customerId:customer_id,totalAmount:total_amount,amountPaid:amount_paid").in("customer_id", ids).neq("status", "CANCELLED").order("id"),
        ),
        all<{ customerId: string; amount: number }>(() => adminDb.from(tbl(schema.payments)).select("customerId:customer_id,amount").in("customer_id", ids).is("voided_at", null).order("id")),
        all<{ customerId: string; eventDate: string }>(() =>
          adminDb.from(tbl(schema.events)).select("customerId:customer_id,eventDate:event_date").in("customer_id", ids).neq("status", "CANCELLED").order("id"),
        ),
      ])
    : [[], [], []];
  const rows = page_.map((c) => {
    const mine = bookings.filter((b) => b.customerId === c.id);
    const dates = events.filter((e) => e.customerId === c.id).map((e) => e.eventDate);
    return {
      c,
      bookings: mine.length,
      lifetime: payments.filter((p) => p.customerId === c.id).reduce((s, p) => s + p.amount, 0),
      outstanding: mine.reduce((s, b) => s + Math.max(b.totalAmount - b.amountPaid, 0), 0),
      lastEvent: dates.length ? dates.sort().at(-1)! : null,
    };
  });
  const showMoney = user.permissions.has("payments.view");

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you've worked with or quoted — each with their full history."
        actions={
          <>
            <ExportLink entity="customers" />
            {user.permissions.has("customers.create") && <ImportButton entity="customers" />}
            {user.permissions.has("customers.create") && (
              <LinkButton href="/admin/customers/new" variant="primary" icon={Plus}>
                New customer
              </LinkButton>
            )}
          </>
        }
      />
      <Tabs
        active={archived ? "archived" : "active"}
        items={[
          { key: "active", label: "Active", href: "/admin/customers" },
          { key: "archived", label: "Archived", href: "/admin/customers?archived=1" },
        ]}
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Name, phone, email or address" />
          <FilterSelect param="source" label="Source" options={sources} />
          <FilterSelect
            param="type"
            label="Show"
            allLabel="Everyone"
            options={[
              { value: "returning", label: "Returning customers" },
              { value: "portal", label: "With portal access" },
            ]}
          />
        </Toolbar>
        <BulkTable
          columns={[{ label: "Customer" }, { label: "Contact" }, { label: "Source" }, { label: "Bookings" }, ...(showMoney ? [{ label: "Paid to date" }, { label: "Outstanding" }] : []), { label: "Last event" }]}
          actions={user.permissions.has("customers.update") ? [{ label: "Archive", icon: <Archive />, action: bulkArchiveCustomers, confirm: "Archived customers are hidden from lists but keep their history.", success: "Archived" }] : []}
          rows={rows.map(({ c: r, bookings, lifetime, outstanding, lastEvent }) => ({
            id: r.id,
            cells: [
              <div key="n">
                <Link href={`/admin/customers/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {bookings > 1 && <Badge tone="gold">Returning</Badge>}
                  {r.authUserId && <Badge tone="info">Portal</Badge>}
                  {r.tags
                    .slice(0, 2)
                    .map((t) => (
                      <Badge key={t} icon={false}>
                        {t}
                      </Badge>
                    ))}
                </div>
              </div>,
              <div key="ct" className="text-xs">
                {r.phone ?? "—"}
                <span className="block text-a-muted">{r.email}</span>
              </div>,
              sources.find((s) => s.value === r.sourceKey)?.label ?? "—",
              bookings,
              ...(showMoney ? [npr(lifetime), outstanding > 0 ? <span key="o" className="font-medium text-a-warning">{npr(outstanding)}</span> : "—"] : []),
              lastEvent ? fmtDate(lastEvent) : "—",
            ],
          }))}
          empty={
            <EmptyState icon={Contact} title={q ? "No customers match" : "No customers yet"} action={!q && user.permissions.has("customers.create") ? <LinkButton href="/admin/customers/new" size="sm">Add a customer</LinkButton> : undefined}>
              {q ? "Try a different search." : "Customers are created automatically from inquiries."}
            </EmptyState>
          }
        />
        <Pagination basePath="/admin/customers" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
