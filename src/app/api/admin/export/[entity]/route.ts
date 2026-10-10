import { NextResponse } from "next/server";
import { adminDb, all, cols, schema, tbl, type Row } from "@/db";
import { audit } from "@/lib/audit";
import type { Permission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { toCsv } from "@/lib/csv";
import { inventoryWithStock } from "@/server/inventory";

type Export = { permission: Permission; run: (q: URLSearchParams) => Promise<{ headers: string[]; rows: unknown[][] }> };

const EXPORTS: Record<string, Export> = {
  customers: {
    permission: "customers.view",
    run: async () => {
      const [customers, sources, bookings, payments] = await Promise.all([
        all<{ id: string; name: string; phone: string | null; email: string | null; address: string | null; sourceKey: string | null; createdAt: Date }>(() =>
          adminDb.from(tbl(schema.customers)).select("id,name,phone,email,address,sourceKey:source_key,createdAt:created_at").is("deleted_at", null).order("name").order("id"),
        ),
        all<{ key: string; name: string }>(() => adminDb.from(tbl(schema.campaignSources)).select("key,name").order("key")),
        all<{ customerId: string }>(() => adminDb.from(tbl(schema.bookings)).select("customerId:customer_id").neq("status", "CANCELLED").order("id")),
        all<{ customerId: string; amount: number }>(() => adminDb.from(tbl(schema.payments)).select("customerId:customer_id,amount").is("voided_at", null).order("id")),
      ]);
      const booked = new Map<string, number>();
      for (const b of bookings) booked.set(b.customerId, (booked.get(b.customerId) ?? 0) + 1);
      const paid = new Map<string, number>();
      for (const p of payments) paid.set(p.customerId, (paid.get(p.customerId) ?? 0) + p.amount);
      return {
        headers: ["Name", "Phone", "Email", "Address", "Source", "Bookings", "Total paid (NPR)", "Created"],
        rows: customers.map((c) => [c.name, c.phone, c.email, c.address, sources.find((s) => s.key === c.sourceKey)?.name ?? null, booked.get(c.id) ?? 0, paid.get(c.id) ?? 0, c.createdAt]),
      };
    },
  },
  leads: {
    permission: "leads.view",
    run: async () => {
      const rows = await all<Row<typeof schema.leads>>(() =>
        adminDb.from(tbl(schema.leads)).select(cols(schema.leads)).is("deleted_at", null).order("created_at", { ascending: false }).order("id"),
      );
      return {
        headers: ["Number", "Name", "Phone", "Email", "Event type", "Event date", "Location", "Guests", "Budget", "Source", "Stage", "Priority", "Created"],
        rows: rows.map((r) => [r.number, r.name, r.phone, r.email, r.eventType, r.eventDate, r.location, r.guestCount, r.budget, r.sourceKey, r.stage, r.priority, r.createdAt]),
      };
    },
  },
  inquiries: {
    permission: "leads.view",
    run: async () => {
      const rows = await all<Row<typeof schema.inquiries>>(() =>
        adminDb.from(tbl(schema.inquiries)).select(cols(schema.inquiries)).eq("spam", false).order("created_at", { ascending: false }).order("id"),
      );
      return {
        headers: ["Number", "Type", "Name", "Phone", "Email", "Event type", "Event date", "Venue", "Guests", "Budget", "Source", "Status", "UTM campaign", "Received"],
        rows: rows.map((r) => [r.number, r.kind, r.name, r.phone, r.email, r.eventType, r.eventDate, r.venue, r.guestCount, r.budget, r.sourceKey, r.status, r.utm?.utm_campaign, r.createdAt]),
      };
    },
  },
  inventory: {
    permission: "inventory.view",
    run: async () => {
      const items = await inventoryWithStock();
      return {
        headers: ["SKU", "Name", "Category", "Quantity", "Available", "Reserved", "Damaged", "Maintenance", "Low stock", "Unit", "Purchase cost", "Replacement cost", "Rental price", "Location"],
        rows: items.map((i) => [i.sku, i.name, i.category, i.quantity, i.available, i.reserved, i.damaged, i.inMaintenance, i.lowStockThreshold, i.unit, i.purchaseCost, i.replacementCost, i.rentalPrice, i.location]),
      };
    },
  },
  payments: {
    permission: "payments.view",
    run: async () => {
      const rows = await all<Row<typeof schema.payments> & { c: { name: string }; b: { number: string }; inv: { number: string } | null }>(() =>
        adminDb
          .from(tbl(schema.payments))
          .select(`${cols(schema.payments)},c:customers!inner(name),b:bookings!inner(number),inv:invoices(number)`)
          .order("paid_at", { ascending: false })
          .order("id"),
      );
      return {
        headers: ["Receipt", "Date", "Customer", "Booking", "Invoice", "Amount (NPR)", "Method", "Reference", "Void"],
        rows: rows.map((p) => [p.number, p.paidAt, p.c.name, p.b.number, p.inv?.number ?? null, p.amount, p.method, p.reference, p.voidedAt ? `Void: ${p.voidReason ?? ""}` : ""]),
      };
    },
  },
  invoices: {
    permission: "invoices.view",
    run: async () => {
      const rows = await all<Row<typeof schema.invoices> & { c: { name: string }; b: { number: string } }>(() =>
        adminDb
          .from(tbl(schema.invoices))
          .select(`${cols(schema.invoices)},c:customers!inner(name),b:bookings!inner(number)`)
          .order("issue_date", { ascending: false })
          .order("id"),
      );
      return {
        headers: ["Invoice", "Issued", "Due", "Customer", "Booking", "Total (NPR)", "Paid (NPR)", "Balance (NPR)", "Status"],
        rows: rows.map((i) => [i.number, i.issueDate, i.dueDate, i.c.name, i.b.number, i.total, i.amountPaid, Math.max(0, i.total - i.amountPaid), i.status]),
      };
    },
  },
  expenses: {
    permission: "expenses.view",
    run: async () => {
      const rows = await all<Row<typeof schema.expenses> & { cat: { name: string }; v: { name: string } | null; ev: { title: string } | null }>(() =>
        adminDb
          .from(tbl(schema.expenses))
          .select(`${cols(schema.expenses)},cat:expense_categories!inner(name),v:vendors(name),ev:events(title)`)
          .is("voided_at", null)
          .order("date", { ascending: false })
          .order("id"),
      );
      return {
        headers: ["Date", "Category", "Description", "Amount (NPR)", "Vendor", "Event", "Method", "Notes"],
        rows: rows.map((x) => [x.date, x.cat.name, x.description, x.amount, x.v?.name ?? null, x.ev?.title ?? null, x.method, x.notes]),
      };
    },
  },
  bookings: {
    permission: "bookings.view",
    run: async () => {
      const raw = await all<Row<typeof schema.bookings> & { c: { name: string }; events: { title: string; eventDate: string; venue: string | null }[] }>(() =>
        adminDb.from(tbl(schema.bookings)).select(`${cols(schema.bookings)},c:customers!inner(name),events(title,eventDate:event_date,venue)`).order("id"),
      );
      const rows = raw
        .flatMap((b) => (b.events.length ? b.events : [null]).map((e) => ({ b, customer: b.c.name, title: e?.title ?? null, date: e?.eventDate ?? null, venue: e?.venue ?? null })))
        .sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999"));
      return {
        headers: ["Booking", "Customer", "Event", "Date", "Venue", "Status", "Total (NPR)", "Advance (NPR)", "Paid (NPR)", "Balance (NPR)", "Source"],
        rows: rows.map(({ b, customer, title, date, venue }) => [b.number, customer, title, date, venue, b.status, b.totalAmount, b.depositAmount, b.amountPaid, Math.max(0, b.totalAmount - b.amountPaid), b.sourceKey]),
      };
    },
  },
};

/** CSV download of a list. Requires the same permission as viewing it; every export is audited. */
export async function GET(request: Request, { params }: RouteContext<"/api/admin/export/[entity]">) {
  const user = await getCurrentUser();
  if (!user?.isStaff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { entity } = await params;
  const def = EXPORTS[entity];
  if (!def) return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  if (!user.permissions.has(def.permission)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { headers, rows } = await def.run(new URL(request.url).searchParams);
  await audit(user, "export", entity, null, `Exported ${rows.length} ${entity} to CSV`);
  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="timeless-${entity}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
