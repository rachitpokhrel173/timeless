import "server-only";
import { adminDb as db, all, many } from "@/db";
import type { Permission } from "@/lib/auth/permissions";
import { todayISO } from "@/lib/format";
import { eventProfits, vendorPaid } from "./finance";
import { inventoryWithStock } from "./inventory";
import { revenueBy, salesFunnel, sourcePerformance, type Range } from "./metrics";

/*
 * Every report is computed from live database rows for the chosen date range. The Reports page
 * renders them; /api/admin/reports/<key> exports the same rows as CSV.
 */

export type ColumnFormat = "text" | "npr" | "number" | "percent" | "date";
export type Report = {
  title: string;
  description: string;
  columns: { label: string; format: ColumnFormat }[];
  rows: (string | number | null)[][];
  summary: { label: string; value: number; format: ColumnFormat }[];
  /** Optional bar chart: column index of the label and of the value. */
  chart?: { label: number; value: number; format: "npr" | "number" };
};

export const REPORTS: { key: string; label: string; permission: Permission; group: string }[] = [
  { key: "sales", label: "Sales by event type", permission: "reports.view", group: "Sales" },
  { key: "packages", label: "Sales by package", permission: "reports.view", group: "Sales" },
  { key: "leads", label: "Leads by source", permission: "reports.view", group: "Sales" },
  { key: "conversion", label: "Conversion funnel", permission: "reports.view", group: "Sales" },
  { key: "inquiries", label: "Inquiries", permission: "reports.view", group: "Sales" },
  { key: "bookings", label: "Bookings", permission: "reports.view", group: "Operations" },
  { key: "events", label: "Event performance", permission: "reports.view", group: "Operations" },
  { key: "inventory", label: "Inventory usage", permission: "reports.view", group: "Operations" },
  { key: "staff", label: "Staff utilisation", permission: "reports.view", group: "Operations" },
  { key: "revenue", label: "Revenue & payments", permission: "payments.view", group: "Finance" },
  { key: "outstanding", label: "Outstanding balances", permission: "payments.view", group: "Finance" },
  { key: "expenses", label: "Expenses", permission: "expenses.view", group: "Finance" },
  { key: "profitability", label: "Event profitability", permission: "expenses.view", group: "Finance" },
  { key: "vendors", label: "Vendor costs", permission: "expenses.view", group: "Finance" },
];

const tsFrom = (d: string) => new Date(`${d}T00:00:00+05:45`).toISOString();
const tsTo = (d: string) => new Date(new Date(`${d}T00:00:00+05:45`).getTime() + 86_400_000).toISOString();
const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
const titleCase = (s: string | null) => (s ? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Unspecified");
const pct = (a: number, b: number) => (b ? (a / b) * 100 : null);

export async function buildReport(key: string, range: Range): Promise<Report | null> {
  switch (key) {
    case "sales":
    case "packages": {
      const rows = await revenueBy(key === "sales" ? "eventType" : "package", range);
      const total = sum(rows, (r) => r.value);
      return {
        title: key === "sales" ? "Sales by event type" : "Sales by package",
        description: "Cash received in the period, grouped by what was booked.",
        columns: [
          { label: key === "sales" ? "Event type" : "Package", format: "text" },
          { label: "Received", format: "npr" },
          { label: "Share", format: "percent" },
        ],
        rows: rows.map((r) => [r.label, r.value, pct(r.value, total)]),
        summary: [{ label: "Total received", value: total, format: "npr" }],
        chart: { label: 0, value: 1, format: "npr" },
      };
    }
    case "leads": {
      const rows = await sourcePerformance(range);
      return {
        title: "Leads by source",
        description: "Where leads came from, how many became bookings and the cash they brought in.",
        columns: [
          { label: "Source", format: "text" },
          { label: "Leads", format: "number" },
          { label: "Won", format: "number" },
          { label: "Conversion", format: "percent" },
          { label: "Bookings", format: "number" },
          { label: "Revenue", format: "npr" },
        ],
        rows: rows.map((r) => [r.name, r.leads, r.won, r.conversion, r.bookings, r.revenue]),
        summary: [
          { label: "Leads", value: sum(rows, (r) => r.leads), format: "number" },
          { label: "Won", value: sum(rows, (r) => r.won), format: "number" },
          { label: "Revenue", value: sum(rows, (r) => r.revenue), format: "npr" },
        ],
        chart: { label: 0, value: 1, format: "number" },
      };
    }
    case "conversion": {
      const stages = await salesFunnel(range);
      const top = stages[0]?.value ?? 0;
      return {
        title: "Conversion funnel",
        description: "How far the leads created in this period have progressed.",
        columns: [
          { label: "Stage", format: "text" },
          { label: "Leads", format: "number" },
          { label: "Of all leads", format: "percent" },
          { label: "From previous stage", format: "percent" },
        ],
        rows: stages.map((s, i) => [s.label, s.value, pct(s.value, top), i ? pct(s.value, stages[i - 1]!.value) : null]),
        summary: [
          { label: "Leads", value: top, format: "number" },
          { label: "Lead → booking", value: pct(stages.find((s) => s.label === "Confirmed")?.value ?? 0, top) ?? 0, format: "percent" },
        ],
        chart: { label: 0, value: 1, format: "number" },
      };
    }
    case "inquiries": {
      const rows = await all<{ status: string; kind: string; eventType: string; sourceKey: string; createdAt: string }>(() =>
        db.from("inquiries").select("status,kind,eventType:event_type,sourceKey:source_key,createdAt:created_at").eq("spam", false).gte("created_at", tsFrom(range.from)).lt("created_at", tsTo(range.to)).order("id"),
      );
      const types = new Map<string, { n: number; booked: number; requests: number }>();
      for (const r of rows) {
        const t = types.get(r.eventType) ?? { n: 0, booked: 0, requests: 0 };
        t.n++;
        if (["CONFIRMED", "COMPLETED"].includes(r.status)) t.booked++;
        if (r.kind === "BOOKING_REQUEST") t.requests++;
        types.set(r.eventType, t);
      }
      return {
        title: "Inquiries",
        description: "Website and manual inquiries received, by event type.",
        columns: [
          { label: "Event type", format: "text" },
          { label: "Inquiries", format: "number" },
          { label: "Booking requests", format: "number" },
          { label: "Became bookings", format: "number" },
          { label: "Conversion", format: "percent" },
        ],
        rows: [...types].sort((a, b) => b[1].n - a[1].n).map(([t, v]) => [titleCase(t), v.n, v.requests, v.booked, pct(v.booked, v.n)]),
        summary: [
          { label: "Inquiries", value: rows.length, format: "number" },
          { label: "Booked", value: rows.filter((r) => ["CONFIRMED", "COMPLETED"].includes(r.status)).length, format: "number" },
        ],
        chart: { label: 0, value: 1, format: "number" },
      };
    }
    case "bookings": {
      const rows = await all<{ number: string; status: string; totalAmount: number; amountPaid: number; createdAt: string; c: { name: string }; e: { title: string; eventDate: string } | { title: string; eventDate: string }[] | null }>(() =>
        db
          .from("bookings")
          .select("number,status,totalAmount:total_amount,amountPaid:amount_paid,createdAt:created_at,c:customers!inner(name),e:events(title,eventDate:event_date)")
          .gte("created_at", tsFrom(range.from))
          .lt("created_at", tsTo(range.to))
          .order("created_at")
          .order("id"),
      );
      const live = rows.filter((r) => r.status !== "CANCELLED");
      return {
        title: "Bookings",
        description: "Bookings created in the period.",
        columns: [
          { label: "Booking", format: "text" },
          { label: "Customer", format: "text" },
          { label: "Event", format: "text" },
          { label: "Event date", format: "date" },
          { label: "Status", format: "text" },
          { label: "Value", format: "npr" },
          { label: "Paid", format: "npr" },
        ],
        rows: rows.map((r) => {
          const e = Array.isArray(r.e) ? r.e[0] : r.e;
          return [r.number, r.c.name, e?.title ?? "—", e?.eventDate ?? null, titleCase(r.status.toLowerCase()), r.totalAmount, r.amountPaid];
        }),
        summary: [
          { label: "Bookings", value: live.length, format: "number" },
          { label: "Contract value", value: sum(live, (r) => r.totalAmount), format: "npr" },
          { label: "Average booking", value: live.length ? sum(live, (r) => r.totalAmount) / live.length : 0, format: "npr" },
          { label: "Cancelled", value: rows.length - live.length, format: "number" },
        ],
      };
    }
    case "events":
    case "profitability": {
      const events = await many<{ id: string; title: string; eventType: string | null; eventDate: string; status: string }>(
        db.from("events").select("id,title,eventType:event_type,eventDate:event_date,status").gte("event_date", range.from).lte("event_date", range.to).neq("status", "CANCELLED").order("event_date").limit(1000),
      );
      const profits = await eventProfits(events.map((e) => e.id));
      if (key === "profitability") {
        const rows = events.map((e) => ({ e, p: profits.get(e.id)! })).filter((x) => x.p);
        return {
          title: "Event profitability",
          description: "Revenue against vendor, staff, décor loss and other costs for events held in the period.",
          columns: [
            { label: "Event", format: "text" },
            { label: "Date", format: "date" },
            { label: "Revenue", format: "npr" },
            { label: "Estimated cost", format: "npr" },
            { label: "Actual cost", format: "npr" },
            { label: "Gross profit", format: "npr" },
            { label: "Margin", format: "percent" },
            { label: "Outstanding", format: "npr" },
          ],
          rows: rows.map(({ e, p }) => [e.title, e.eventDate, p.revenue, p.estimatedCost, p.actualCost, p.grossProfit, p.margin, p.outstanding]),
          summary: [
            { label: "Revenue", value: sum(rows, (r) => r.p.revenue), format: "npr" },
            { label: "Actual cost", value: sum(rows, (r) => r.p.actualCost), format: "npr" },
            { label: "Gross profit", value: sum(rows, (r) => r.p.grossProfit), format: "npr" },
            { label: "Margin", value: pct(sum(rows, (r) => r.p.grossProfit), sum(rows, (r) => r.p.revenue)) ?? 0, format: "percent" },
          ],
        };
      }
      const byType = new Map<string, { n: number; revenue: number; profit: number; done: number }>();
      for (const e of events) {
        const p = profits.get(e.id);
        const t = byType.get(titleCase(e.eventType)) ?? { n: 0, revenue: 0, profit: 0, done: 0 };
        t.n++;
        t.revenue += p?.revenue ?? 0;
        t.profit += p?.grossProfit ?? 0;
        if (e.status === "COMPLETED") t.done++;
        byType.set(titleCase(e.eventType), t);
      }
      return {
        title: "Event performance",
        description: "Events held in the period by type: volume, average value and profit.",
        columns: [
          { label: "Event type", format: "text" },
          { label: "Events", format: "number" },
          { label: "Completed", format: "number" },
          { label: "Revenue", format: "npr" },
          { label: "Average value", format: "npr" },
          { label: "Gross profit", format: "npr" },
        ],
        rows: [...byType].sort((a, b) => b[1].revenue - a[1].revenue).map(([t, v]) => [t, v.n, v.done, v.revenue, v.n ? v.revenue / v.n : 0, v.profit]),
        summary: [
          { label: "Events", value: events.length, format: "number" },
          { label: "Revenue", value: sum([...byType.values()], (v) => v.revenue), format: "npr" },
        ],
        chart: { label: 0, value: 3, format: "npr" },
      };
    }
    case "revenue": {
      const payments = await all<{ amount: number; method: string; paidAt: string }>(() =>
        db.from("payments").select("amount,method,paidAt:paid_at").is("voided_at", null).gte("paid_at", range.from).lte("paid_at", range.to).order("id"),
      );
      const months = new Map<string, number>();
      for (const p of payments) months.set(p.paidAt.slice(0, 7), (months.get(p.paidAt.slice(0, 7)) ?? 0) + p.amount);
      const methods = new Map<string, number>();
      for (const p of payments) methods.set(p.method, (methods.get(p.method) ?? 0) + p.amount);
      return {
        title: "Revenue & payments",
        description: "Cash received per month, with the payment methods used.",
        columns: [
          { label: "Month", format: "text" },
          { label: "Received", format: "npr" },
        ],
        rows: [...months].sort().map(([m, v]) => [new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(`${m}-01T00:00:00`)), v]),
        summary: [{ label: "Total received", value: sum(payments, (p) => p.amount), format: "npr" }, { label: "Payments", value: payments.length, format: "number" }, ...[...methods].map(([m, v]) => ({ label: titleCase(m.toLowerCase()), value: v, format: "npr" as const }))],
        chart: { label: 0, value: 1, format: "npr" },
      };
    }
    case "outstanding": {
      const today = todayISO();
      const rows = (
        await all<{ number: string; status: string; totalAmount: number; amountPaid: number; balanceDueDate: string | null; c: { name: string; phone: string | null } }>(() =>
          db.from("bookings").select("number,status,totalAmount:total_amount,amountPaid:amount_paid,balanceDueDate:balance_due_date,c:customers!inner(name,phone)").neq("status", "CANCELLED").order("balance_due_date").order("id"),
        )
      ).filter((b) => b.totalAmount > b.amountPaid);
      const days = (d: string | null) => (d && d < today ? Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000) : 0);
      return {
        title: "Outstanding balances",
        description: "Money still owed on active bookings, oldest due first. (Not limited to the date range.)",
        columns: [
          { label: "Booking", format: "text" },
          { label: "Customer", format: "text" },
          { label: "Phone", format: "text" },
          { label: "Due", format: "date" },
          { label: "Days overdue", format: "number" },
          { label: "Value", format: "npr" },
          { label: "Outstanding", format: "npr" },
        ],
        rows: rows.map((b) => [b.number, b.c.name, b.c.phone, b.balanceDueDate, days(b.balanceDueDate), b.totalAmount, b.totalAmount - b.amountPaid]),
        summary: [
          { label: "Outstanding", value: sum(rows, (b) => b.totalAmount - b.amountPaid), format: "npr" },
          { label: "Overdue", value: sum(rows.filter((b) => days(b.balanceDueDate) > 0), (b) => b.totalAmount - b.amountPaid), format: "npr" },
          { label: "Bookings", value: rows.length, format: "number" },
        ],
      };
    }
    case "expenses": {
      const rows = await all<{ amount: number; cat: { name: string }; vendorAssignmentId: string | null }>(() =>
        db.from("expenses").select("amount,vendorAssignmentId:vendor_assignment_id,cat:expense_categories!inner(name)").is("voided_at", null).gte("date", range.from).lte("date", range.to).order("id"),
      );
      const by = new Map<string, { n: number; v: number }>();
      for (const r of rows) by.set(r.cat.name, { n: (by.get(r.cat.name)?.n ?? 0) + 1, v: (by.get(r.cat.name)?.v ?? 0) + r.amount });
      const total = sum(rows, (r) => r.amount);
      return {
        title: "Expenses",
        description: "Money spent in the period, by category.",
        columns: [
          { label: "Category", format: "text" },
          { label: "Entries", format: "number" },
          { label: "Spent", format: "npr" },
          { label: "Share", format: "percent" },
        ],
        rows: [...by].sort((a, b) => b[1].v - a[1].v).map(([c, x]) => [c, x.n, x.v, pct(x.v, total)]),
        summary: [
          { label: "Total spent", value: total, format: "npr" },
          { label: "Vendor payments", value: sum(rows.filter((r) => r.vendorAssignmentId), (r) => r.amount), format: "npr" },
        ],
        chart: { label: 0, value: 2, format: "npr" },
      };
    }
    case "vendors": {
      const jobs = await all<{ id: string; cost: number; v: { name: string; category: string }; e: { eventDate: string } }>(() =>
        db.from("vendor_assignments").select("id,cost,v:vendors!inner(name,category),e:events!inner(event_date)").neq("status", "CANCELLED").gte("e.event_date", range.from).lte("e.event_date", range.to).order("id"),
      );
      const paid = await vendorPaid(jobs.map((j) => j.id));
      const by = new Map<string, { cat: string; n: number; cost: number; paid: number }>();
      for (const j of jobs) {
        const x = by.get(j.v.name) ?? { cat: j.v.category, n: 0, cost: 0, paid: 0 };
        x.n++;
        x.cost += j.cost;
        x.paid += paid.get(j.id) ?? 0;
        by.set(j.v.name, x);
      }
      return {
        title: "Vendor costs",
        description: "Vendor bookings for events held in the period.",
        columns: [
          { label: "Vendor", format: "text" },
          { label: "Category", format: "text" },
          { label: "Jobs", format: "number" },
          { label: "Cost", format: "npr" },
          { label: "Paid", format: "npr" },
          { label: "Owed", format: "npr" },
        ],
        rows: [...by].sort((a, b) => b[1].cost - a[1].cost).map(([name, x]) => [name, titleCase(x.cat.toLowerCase()), x.n, x.cost, x.paid, Math.max(0, x.cost - x.paid)]),
        summary: [
          { label: "Vendor cost", value: sum([...by.values()], (x) => x.cost), format: "npr" },
          { label: "Owed", value: sum([...by.values()], (x) => Math.max(0, x.cost - x.paid)), format: "npr" },
        ],
        chart: { label: 0, value: 3, format: "npr" },
      };
    }
    case "staff": {
      const [people, rows] = await Promise.all([
        many<{ id: string; name: string; role: string | null; dailyRate: number }>(db.from("staff").select("id,name,role,dailyRate:daily_rate").is("archived_at", null).order("name")),
        all<{ staffId: string; days: number; e: { eventDate: string } }>(() =>
          db.from("staff_assignments").select("staffId:staff_id,days,e:events!inner(event_date)").neq("e.status", "CANCELLED").gte("e.event_date", range.from).lte("e.event_date", range.to).order("id"),
        ),
      ]);
      const periodDays = Math.max(1, Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1);
      return {
        title: "Staff utilisation",
        description: "Event days worked per team member in the period.",
        columns: [
          { label: "Team member", format: "text" },
          { label: "Role", format: "text" },
          { label: "Events", format: "number" },
          { label: "Days", format: "number" },
          { label: "Utilisation", format: "percent" },
          { label: "Cost", format: "npr" },
        ],
        rows: people
          .map((p) => {
            const mine = rows.filter((r) => r.staffId === p.id);
            const d = sum(mine, (r) => Number(r.days));
            return [p.name, p.role, mine.length, d, (d / periodDays) * 100, d * p.dailyRate] as (string | number | null)[];
          })
          .sort((a, b) => Number(b[3]) - Number(a[3])),
        summary: [
          { label: "Event days", value: sum(rows, (r) => Number(r.days)), format: "number" },
          { label: "Assignments", value: rows.length, format: "number" },
        ],
        chart: { label: 0, value: 3, format: "number" },
      };
    }
    case "inventory": {
      const [items, moves] = await Promise.all([
        inventoryWithStock(),
        all<{ itemId: string; type: string; quantity: number }>(() =>
          db.from("inventory_movements").select("itemId:item_id,type,quantity").in("type", ["RESERVATION", "DAMAGE", "LOSS", "USAGE"]).gte("created_at", tsFrom(range.from)).lt("created_at", tsTo(range.to)).order("id"),
        ),
      ]);
      const by = (id: string, t: string) => sum(moves.filter((m) => m.itemId === id && m.type === t), (m) => m.quantity);
      const rows = items.map((i) => [i.name, i.category, i.quantity, i.available, by(i.id, "RESERVATION"), by(i.id, "DAMAGE"), by(i.id, "LOSS") + by(i.id, "USAGE")] as (string | number | null)[]).sort((a, b) => Number(b[4]) - Number(a[4]));
      return {
        title: "Inventory usage",
        description: "How often each item was reserved, and what was damaged, lost or used up in the period.",
        columns: [
          { label: "Item", format: "text" },
          { label: "Category", format: "text" },
          { label: "Owned", format: "number" },
          { label: "Available now", format: "number" },
          { label: "Units reserved", format: "number" },
          { label: "Damaged", format: "number" },
          { label: "Lost / used", format: "number" },
        ],
        rows,
        summary: [
          { label: "Items", value: items.length, format: "number" },
          { label: "Low stock now", value: items.filter((i) => i.low).length, format: "number" },
          { label: "Units damaged", value: sum(moves.filter((m) => m.type === "DAMAGE"), (m) => m.quantity), format: "number" },
        ],
        chart: { label: 0, value: 4, format: "number" },
      };
    }
  }
  return null;
}
