import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { adminDb, all, cols, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr, todayISO } from "@/lib/format";
import { listParams } from "@/lib/list";
import { PAYMENT_METHODS, vendorPaid, vendorPaymentStatus } from "@/server/finance";
import { expenseCategoryOptions } from "@/server/lookups";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { label, PAY_STATUS, StatusBadge, VENDOR_CATEGORIES } from "@/components/admin/status";
import { Badge, Card, EmptyState, Kpi, PageHeader, Table, Tabs, Td, Th, Toolbar } from "@/components/admin/ui";
import { ExpenseButton } from "../expenses/ExpenseClient";
import { VendorButton } from "./VendorClient";

export const metadata: Metadata = { title: "Vendors" };

export default async function VendorsPage({ searchParams }: PageProps<"/admin/vendors">) {
  const user = await requirePage("vendors.view");
  const sp = await searchParams;
  const { q, str } = listParams(sp);
  const tab = str("tab") === "payments" && user.permissions.has("expenses.view") ? "payments" : str("archived") ? "archived" : "active";

  return (
    <>
      <PageHeader title="Vendors" description="Florists, photographers, lighting, transport and other partners you book for events." actions={tab !== "payments" && user.permissions.has("vendors.manage") && <VendorButton />} />
      <Tabs
        active={tab}
        items={[
          { key: "active", label: "Vendors", href: "/admin/vendors" },
          ...(user.permissions.has("expenses.view") ? [{ key: "payments", label: "Vendor payments", href: "/admin/vendors?tab=payments" }] : []),
          { key: "archived", label: "Archived", href: "/admin/vendors?archived=1" },
        ]}
      />
      {tab === "payments" ? <Payments canPay={user.permissions.has("expenses.create")} /> : <List archived={tab === "archived"} q={q} category={str("category")} money={user.permissions.has("expenses.view")} />}
    </>
  );
}

async function List({ archived, q, category, money }: { archived: boolean; q?: string; category?: string; money: boolean }) {
  const [vendors, jobs] = await Promise.all([
    all<Row<typeof schema.vendors>>(() => {
      let query = adminDb.from(tbl(schema.vendors)).select(cols(schema.vendors));
      query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
      if (category) query = query.eq("category", category);
      return query.order("name").order("id");
    }),
    all<{ vendorId: string; cost: number; status: string }>(() => adminDb.from(tbl(schema.vendorAssignments)).select("vendorId:vendor_id,cost,status").neq("status", "CANCELLED").order("id")),
  ]);
  const shown = q ? vendors.filter((v) => `${v.name} ${v.contactPerson ?? ""} ${v.phone ?? ""}`.toLowerCase().includes(q.toLowerCase())) : vendors;
  return (
    <Card bodyClassName="p-0">
      <Toolbar>
        <SearchBox placeholder="Name, contact or phone" />
        <FilterSelect param="category" label="Category" options={VENDOR_CATEGORIES} />
      </Toolbar>
      {shown.length === 0 ? (
        <EmptyState icon={Store} title={vendors.length ? "No vendors match" : "No vendors yet"} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Vendor</Th>
              <Th>Category</Th>
              <Th>Contact</Th>
              <Th>Rating</Th>
              <Th className="text-right">Jobs</Th>
              {money && <Th className="text-right">Booked value</Th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => {
              const mine = jobs.filter((j) => j.vendorId === v.id);
              return (
                <tr key={v.id} className="hover:bg-a-subtle/60">
                  <Td>
                    <Link href={`/admin/vendors/${v.id}`} className="font-medium hover:underline">
                      {v.name}
                    </Link>
                    {!v.active && (
                      <Badge tone="neutral" className="ml-1.5">
                        Inactive
                      </Badge>
                    )}
                  </Td>
                  <Td>{VENDOR_CATEGORIES.find((c) => c.value === v.category)?.label ?? label(v.category)}</Td>
                  <Td className="text-xs">
                    {v.contactPerson ?? "—"}
                    <span className="block text-a-muted">{v.phone}</span>
                  </Td>
                  <Td className="text-a-gold" aria-label={v.rating ? `${v.rating} of 5` : "Not rated"}>
                    {v.rating ? "★".repeat(v.rating) : <span className="text-a-muted">—</span>}
                  </Td>
                  <Td className="text-right tabular-nums">{mine.length}</Td>
                  {money && <Td className="text-right tabular-nums">{npr(mine.reduce((s, j) => s + j.cost, 0))}</Td>}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

/** What's owed to vendors: each vendor booking with paid / outstanding (payments are expenses linked to it). */
async function Payments({ canPay }: { canPay: boolean }) {
  const rows = await all<{ id: string; service: string; cost: number; dueDate: string | null; status: string; v: { id: string; name: string }; e: { id: string; title: string; eventDate: string } }>(() =>
    adminDb
      .from(tbl(schema.vendorAssignments))
      .select("id,service,cost,dueDate:due_date,status,v:vendors!inner(id,name),e:events!inner(id,title,eventDate:event_date)")
      .neq("status", "CANCELLED")
      .gt("cost", 0)
      .order("due_date", { nullsFirst: false })
      .order("id"),
  );
  const [paid, categories] = await Promise.all([vendorPaid(rows.map((r) => r.id)), canPay ? expenseCategoryOptions() : []]);
  const today = todayISO();
  const open = rows.filter((r) => (paid.get(r.id) ?? 0) < r.cost);
  const owed = open.reduce((s, r) => s + r.cost - (paid.get(r.id) ?? 0), 0);
  const overdue = open.filter((r) => r.dueDate && r.dueDate < today);
  const methods = PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }));
  const vendorCat = categories.find((c) => /vendor/i.test(c.label))?.value;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Owed to vendors" value={npr(owed)} invert />
        <Kpi label="Overdue" value={overdue.length} hint={npr(overdue.reduce((s, r) => s + r.cost - (paid.get(r.id) ?? 0), 0))} invert />
        <Kpi label="Vendor bookings" value={rows.length} />
      </div>
      <Card bodyClassName="p-0">
        {rows.length === 0 ? (
          <EmptyState compact title="No vendor bookings with a cost" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Vendor</Th>
                <Th>Event</Th>
                <Th>Due</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Paid</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = paid.get(r.id) ?? 0;
                const late = p < r.cost && r.dueDate && r.dueDate < today;
                return (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/admin/vendors/${r.v.id}`} className="font-medium hover:underline">
                        {r.v.name}
                      </Link>
                      <span className="block text-xs text-a-muted">{r.service}</span>
                    </Td>
                    <Td className="text-xs">
                      <Link href={`/admin/events/${r.e.id}?tab=vendors`} className="hover:underline">
                        {r.e.title}
                      </Link>
                      <span className="block text-a-muted">{fmtDate(r.e.eventDate)}</span>
                    </Td>
                    <Td className={late ? "font-medium text-a-danger" : undefined}>{fmtDate(r.dueDate)}</Td>
                    <Td className="text-right tabular-nums">{npr(r.cost)}</Td>
                    <Td className="text-right tabular-nums">{npr(p)}</Td>
                    <Td>
                      <StatusBadge map={PAY_STATUS} value={vendorPaymentStatus(r.cost, p)} />
                    </Td>
                    <Td className="text-right">
                      {canPay && p < r.cost && (
                        <ExpenseButton
                          label="Pay"
                          categories={vendorCat ? categories.filter((c) => c.value === vendorCat) : categories}
                          vendors={[{ value: r.v.id, label: r.v.name }]}
                          events={[{ value: r.e.id, label: r.e.title }]}
                          vendorBookings={[{ value: r.id, label: `${r.v.name} · ${r.service}` }]}
                          methods={methods}
                          defaults={{ vendorAssignmentId: r.id, amount: r.cost - p, description: `${r.v.name} — ${r.service}` }}
                        />
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
