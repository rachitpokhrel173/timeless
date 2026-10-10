import "server-only";
import { adminDb as db, all, many, total } from "@/db";
import { todayISO } from "@/lib/format";

/* ───────── Date ranges ───────── */

export const RANGE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
] as const;

export type Range = { from: string; to: string; prevFrom: string; prevTo: string; label: string; key: string };

const addDays = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

/** Inclusive [from, to] calendar dates (Nepal time) plus the equally long period before it. */
export function resolveRange(sp: Record<string, string | string[] | undefined>, fallback = "30d"): Range {
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = todayISO();
  const from = str("from");
  const to = str("to");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) && to >= from ? to : today;
    const len = daysBetween(from, end) + 1;
    return { from, to: end, prevFrom: addDays(from, -len), prevTo: addDays(from, -1), label: `${from} – ${end}`, key: "custom" };
  }
  const key = (RANGE_PRESETS.find((p) => p.value === str("range"))?.value ?? fallback) as string;
  const len = { today: 1, "7d": 7, "30d": 30, "3m": 91, "6m": 182, "12m": 365 }[key] ?? 30;
  const start = addDays(today, -(len - 1));
  return { from: start, to: today, prevFrom: addDays(start, -len), prevTo: addDays(start, -1), label: RANGE_PRESETS.find((p) => p.value === key)!.label, key };
}

/** timestamptz bounds for the Nepal calendar dates [from, to] */
const tsFrom = (from: string) => new Date(`${from}T00:00:00+05:45`).toISOString();
const tsTo = (to: string) => new Date(`${addDays(to, 1)}T00:00:00+05:45`).toISOString();

const sum = <T>(rows: T[], value: (r: T) => number) => rows.reduce((s, r) => s + value(r), 0);
const count = total;
const head = { count: "exact", head: true } as const;

/* ───────── KPIs ───────── */

export async function revenueBetween(from: string, to: string) {
  const rows = await all<{ amount: number }>(() => db.from("payments").select("amount").is("voided_at", null).gte("paid_at", from).lte("paid_at", to).order("id"));
  return sum(rows, (r) => r.amount);
}

export async function expensesBetween(from: string, to: string) {
  const rows = await all<{ amount: number }>(() => db.from("expenses").select("amount").is("voided_at", null).gte("date", from).lte("date", to).order("id"));
  return sum(rows, (r) => r.amount);
}

export async function outstandingTotal() {
  const rows = await all<{ totalAmount: number; amountPaid: number }>(() =>
    db.from("bookings").select("totalAmount:total_amount,amountPaid:amount_paid").neq("status", "CANCELLED").order("id"),
  );
  const open = rows.filter((r) => r.totalAmount - r.amountPaid > 0);
  return { amount: sum(open, (r) => r.totalAmount - r.amountPaid), bookings: open.length };
}

const countLeads = (from: string, to: string) => count(db.from("leads").select("id", head).is("deleted_at", null).gte("created_at", tsFrom(from)).lt("created_at", tsTo(to)));
const countInquiries = (from: string, to: string) => count(db.from("inquiries").select("id", head).eq("spam", false).gte("created_at", tsFrom(from)).lt("created_at", tsTo(to)));
const countBookings = (from: string, to: string) =>
  count(db.from("bookings").select("id", head).neq("status", "CANCELLED").gte("created_at", tsFrom(from)).lt("created_at", tsTo(to)));

export async function dashboardKpis(range: Range) {
  const today = todayISO();
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 8)}01`;
  // Same day-of-month last month, for a fair month-to-date comparison
  const lastMonthToDate = (() => {
    const day = Number(today.slice(8, 10));
    const lastDay = Number(lastMonthEnd.slice(8, 10));
    return `${lastMonthEnd.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, "0")}`;
  })();

  const [
    revenueTotal,
    revenueRange,
    revenuePrev,
    monthRevenue,
    lastMonthRevenue,
    outstanding,
    leadsNow,
    leadsPrev,
    inquiriesNow,
    inquiriesPrev,
    bookingsNow,
    bookingsPrev,
    upcoming,
    active,
    pendingQuotes,
    clients,
    clientsPrev,
    inventoryValue,
  ] = await Promise.all([
    revenueBetween("2000-01-01", today),
    revenueBetween(range.from, range.to),
    revenueBetween(range.prevFrom, range.prevTo),
    revenueBetween(monthStart, today),
    revenueBetween(lastMonthStart, lastMonthToDate),
    outstandingTotal(),
    countLeads(range.from, range.to),
    countLeads(range.prevFrom, range.prevTo),
    countInquiries(range.from, range.to),
    countInquiries(range.prevFrom, range.prevTo),
    countBookings(range.from, range.to),
    countBookings(range.prevFrom, range.prevTo),
    count(db.from("events").select("id", head).not("status", "in", "(CANCELLED,COMPLETED)").gte("event_date", today).lte("event_date", addDays(today, 30))),
    count(db.from("bookings").select("id", head).in("status", ["PENDING", "CONFIRMED", "IN_PROGRESS"])),
    all<{ total: number }>(() => db.from("quotations").select("total").in("status", ["SENT", "VIEWED"]).is("deleted_at", null).order("id")).then((rows) => ({
      c: rows.length,
      v: sum(rows, (r) => r.total),
    })),
    count(db.from("customers").select("id", head).is("deleted_at", null).is("archived_at", null)),
    count(db.from("customers").select("id", head).is("deleted_at", null).lt("created_at", tsFrom(range.from))),
    all<{ quantity: number; purchaseCost: number }>(() => db.from("inventory_items").select("quantity,purchaseCost:purchase_cost").is("archived_at", null).order("id")).then(
      (rows) => sum(rows, (r) => r.quantity * r.purchaseCost),
    ),
  ]);

  return {
    revenueTotal,
    revenueRange,
    revenuePrev,
    monthRevenue,
    lastMonthRevenue,
    outstanding,
    leadsNow,
    leadsPrev,
    inquiriesNow,
    inquiriesPrev,
    bookingsNow,
    bookingsPrev,
    conversion: leadsNow ? (bookingsNow / leadsNow) * 100 : null,
    conversionPrev: leadsPrev ? (bookingsPrev / leadsPrev) * 100 : null,
    upcoming,
    active,
    pendingQuotes,
    clients,
    clientsPrev,
    inventoryValue,
  };
}

/* ───────── Series ───────── */

/** Cash received per month for the last n months (oldest first). */
export async function monthlyRevenue(months = 12) {
  const now = todayISO();
  const keys: string[] = [];
  for (let n = months - 1; n >= 0; n--) {
    const d = new Date(Date.UTC(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1 - n, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  const from = `${keys[0]}-01`;
  const [payments, expenses] = await Promise.all([
    all<{ amount: number; paidAt: string }>(() => db.from("payments").select("amount,paidAt:paid_at").is("voided_at", null).gte("paid_at", from).order("id")),
    all<{ amount: number; date: string }>(() => db.from("expenses").select("amount,date").is("voided_at", null).gte("date", from).order("id")),
  ]);
  return keys.map((m) => ({
    key: m,
    label: new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(new Date(`${m}-01T00:00:00`)),
    revenue: sum(
      payments.filter((p) => String(p.paidAt).slice(0, 7) === m),
      (p) => p.amount,
    ),
    expenses: sum(
      expenses.filter((x) => x.date.slice(0, 7) === m),
      (x) => x.amount,
    ),
  }));
}

export type RevenueDimension = "eventType" | "package" | "customer" | "source";

/** Cash received in the range, grouped by a booking attribute. */
export async function revenueBy(dim: RevenueDimension, range: Range) {
  const [rows, sources] = await Promise.all([
    all<{
      amount: number;
      booking: { sourceKey: string | null; customer: { name: string }; package: { name: string } | null; events: { eventType: string | null }[] };
    }>(() =>
      db
        .from("payments")
        .select("amount,booking:bookings!inner(sourceKey:source_key,customer:customers!inner(name),package:packages(name),events(eventType:event_type))")
        .is("voided_at", null)
        .gte("paid_at", range.from)
        .lte("paid_at", range.to)
        .order("id"),
    ),
    dim === "source" ? many<{ key: string; name: string }>(db.from("campaign_sources").select("key,name")) : Promise.resolve([]),
  ]);
  const titleCase = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const labelOf = (r: (typeof rows)[number]) => {
    const b = r.booking;
    if (dim === "eventType") return b.events[0]?.eventType ? titleCase(b.events[0].eventType.toLowerCase()) : "Unspecified";
    if (dim === "package") return b.package?.name ?? "Custom (no package)";
    if (dim === "customer") return b.customer.name;
    return sources.find((s) => s.key === b.sourceKey)?.name ?? "Unknown";
  };
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(labelOf(r), (totals.get(labelOf(r)) ?? 0) + r.amount);
  return [...totals.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/* ───────── Funnel ───────── */

/**
 * How far leads created in the range got. Each stage counts leads that reached it or any later
 * stage, so the funnel only narrows.
 */
export async function salesFunnel(range: Range) {
  const leads = await all<{
    id: string;
    stage: string;
    lastContactAt: Date | null;
    eventType: string | null;
    eventDate: string | null;
    bookings: { status: string }[];
    quotations: { sentAt: Date | null }[];
    inquiries: { id: string }[];
  }>(() =>
    db
      .from("leads")
      .select("id,stage,lastContactAt:last_contact_at,eventType:event_type,eventDate:event_date,bookings(status),quotations(sentAt:sent_at),inquiries(id)")
      .is("deleted_at", null)
      .gte("created_at", tsFrom(range.from))
      .lt("created_at", tsTo(range.to))
      .order("id"),
  );
  const f = leads.map((l) => {
    const completed = l.bookings.some((b) => b.status === "COMPLETED") || l.stage === "COMPLETED";
    const booked = l.bookings.some((b) => b.status !== "CANCELLED") || ["CONFIRMED", "COMPLETED"].includes(l.stage);
    const negotiation = ["NEGOTIATION", "CONFIRMED", "COMPLETED"].includes(l.stage);
    const quoted = l.quotations.some((q) => q.sentAt) || ["QUOTED", "NEGOTIATION", "CONFIRMED", "COMPLETED"].includes(l.stage);
    const contacted = !["NEW", "LOST"].includes(l.stage) || !!l.lastContactAt;
    const inquiry = l.inquiries.length > 0 || (!!l.eventType && !!l.eventDate);
    return { completed, booked, negotiation, quoted, contacted, inquiry };
  });
  const n = (test: (x: (typeof f)[number]) => boolean) => f.filter(test).length;
  return [
    { label: "Leads", value: f.length },
    { label: "Inquiries", value: n((x) => x.inquiry || x.contacted || x.quoted || x.negotiation || x.booked || x.completed) },
    { label: "Contacted", value: n((x) => x.contacted || x.quoted || x.negotiation || x.booked || x.completed) },
    { label: "Quoted", value: n((x) => x.quoted || x.negotiation || x.booked || x.completed) },
    { label: "Negotiation", value: n((x) => x.negotiation || x.booked || x.completed) },
    { label: "Confirmed", value: n((x) => x.booked || x.completed) },
    { label: "Completed", value: n((x) => x.completed) },
  ];
}

/** Live pipeline: open leads per stage right now (not limited to a date range). */
export async function pipelineSnapshot() {
  const [stages, leads] = await Promise.all([
    many<{ key: string; name: string }>(db.from("sales_pipeline_stages").select("key,name").order("position")),
    all<{ stage: string }>(() => db.from("leads").select("stage").is("deleted_at", null).is("archived_at", null).order("id")),
  ]);
  return stages.map((s) => ({ key: s.key, name: s.name, leads: leads.filter((l) => l.stage === s.key).length }));
}

/** Leads, bookings, revenue and spend per lead source in the range. */
export async function sourcePerformance(range: Range) {
  const [sources, leads, bookings, payments] = await Promise.all([
    many<{ key: string; name: string }>(db.from("campaign_sources").select("key,name")),
    all<{ sourceKey: string; stage: string }>(() =>
      db.from("leads").select("sourceKey:source_key,stage").is("deleted_at", null).gte("created_at", tsFrom(range.from)).lt("created_at", tsTo(range.to)).order("id"),
    ),
    all<{ sourceKey: string | null }>(() =>
      db.from("bookings").select("sourceKey:source_key").neq("status", "CANCELLED").gte("created_at", tsFrom(range.from)).lt("created_at", tsTo(range.to)).order("id"),
    ),
    all<{ amount: number; booking: { sourceKey: string | null } }>(() =>
      db.from("payments").select("amount,booking:bookings!inner(sourceKey:source_key)").is("voided_at", null).gte("paid_at", range.from).lte("paid_at", range.to).order("id"),
    ),
  ]);
  return sources
    .map((s) => {
      const mine = leads.filter((l) => l.sourceKey === s.key);
      const won = mine.filter((l) => ["CONFIRMED", "COMPLETED"].includes(l.stage)).length;
      return {
        source: s.key,
        name: s.name,
        leads: mine.length,
        won,
        bookings: bookings.filter((b) => b.sourceKey === s.key).length,
        revenue: sum(
          payments.filter((p) => p.booking.sourceKey === s.key),
          (p) => p.amount,
        ),
      };
    })
    .map((r) => ({ ...r, conversion: r.leads ? (r.won / r.leads) * 100 : null }))
    .filter((r) => r.leads || r.bookings || r.revenue)
    .sort((a, b2) => b2.revenue - a.revenue || b2.leads - a.leads);
}
