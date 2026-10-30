import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { AlertTriangle, Boxes, CalendarCheck, CalendarDays, FileText, Inbox, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { adminDb, all, cols, many, schema, tbl, total, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, fmtDay, fmtTime, isoDaysFromNow, npr, nprCompact, pctChange, relativeTime, todayISO } from "@/lib/format";
import { maybeRunSweep } from "@/server/automation";
import { inventoryWithStock } from "@/server/inventory";
import { dashboardKpis, monthlyRevenue, outstandingTotal, pipelineSnapshot, resolveRange, salesFunnel } from "@/server/metrics";
import { eventTypeName, eventTypeOptions } from "@/server/lookups";
import { BarList, ColumnChart, Funnel } from "@/components/admin/charts";
import RangeFilter from "@/components/admin/RangeFilter";
import { INQUIRY_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, Card, EmptyState, Kpi, LinkButton, PageHeader } from "@/components/admin/ui";
import DashboardCustomizer from "./DashboardCustomizer";
import { DEFAULT_WIDGETS, WIDGETS, type WidgetKey } from "./widgets";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const user = await requirePage("dashboard.view");
  // Field team (no planning or sales access) start on their own schedule
  if (user.staffId && user.permissions.has("tasks.update") && !(["events.update", "leads.view", "bookings.view", "invoices.view"] as const).some((p) => user.permissions.has(p))) redirect("/admin/my-work");
  const sp = await searchParams;
  const range = resolveRange(sp);
  const has = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const visible = WIDGETS.filter((w) => !("permission" in w) || has(w.permission));
  const chosen = user.prefs.widgets?.filter((w): w is WidgetKey => visible.some((v) => v.key === w)) ?? DEFAULT_WIDGETS.filter((w) => visible.some((v) => v.key === w));
  const on = (w: WidgetKey) => chosen.includes(w);
  const pos = (w: WidgetKey) => chosen.indexOf(w) * 2;

  // Daily automations also run from here (at most hourly) when no cron job is configured
  after(() => maybeRunSweep().catch((e) => console.error("[automations]", e)));

  const today = todayISO();
  const [kpis, months, funnel, pipeline, followups, upcoming, inquiries, lowStock, payments, outstanding, activity, types] = await Promise.all([
    on("kpis") ? dashboardKpis(range) : null,
    on("revenue") ? monthlyRevenue(12) : null,
    on("conversion") ? salesFunnel(range) : null,
    on("pipeline") ? pipelineSnapshot() : null,
    on("followups")
      ? many<Row<typeof schema.followups> & { lead: { id: string; name: string } | null }>(
          adminDb
            .from(tbl(schema.followups))
            .select(`${cols(schema.followups)},lead:leads(id,name)`)
            .in("status", ["PENDING", "OVERDUE"])
            .lte("due_at", isoDaysFromNow(7))
            .order("due_at")
            .limit(30),
        ).then((rows) => rows.map(({ lead, ...f }) => ({ f, lead })))
      : null,
    on("upcoming")
      ? many<Row<typeof schema.events> & { c: { name: string } | null }>(
          adminDb
            .from(tbl(schema.events))
            .select(`${cols(schema.events)},c:customers(name)`)
            .gte("event_date", today)
            .not("status", "in", "(CANCELLED,COMPLETED)")
            .order("event_date")
            .limit(6),
        ).then((rows) => rows.map(({ c, ...e }) => ({ e, customer: c?.name ?? null })))
      : null,
    on("inquiries")
      ? many<Row<typeof schema.inquiries>>(adminDb.from(tbl(schema.inquiries)).select(cols(schema.inquiries)).eq("spam", false).is("archived_at", null).order("created_at", { ascending: false }).limit(6))
      : null,
    (on("inventory") || on("kpis")) && has("inventory.view") ? inventoryWithStock().then((items) => items.filter((i) => i.low)) : null,
    on("payments")
      ? many<Row<typeof schema.payments> & { c: { name: string } }>(
          adminDb
            .from(tbl(schema.payments))
            .select(`${cols(schema.payments)},c:customers!inner(name)`)
            .is("voided_at", null)
            .order("paid_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(6),
        ).then((rows) => rows.map(({ c, ...p }) => ({ p, customer: c.name })))
      : null,
    on("outstanding") ? outstandingList() : null,
    on("activity")
      ? many<Row<typeof schema.activityLogs>>(adminDb.from(tbl(schema.activityLogs)).select(cols(schema.activityLogs)).neq("action", "login").order("created_at", { ascending: false }).limit(8))
      : null,
    eventTypeOptions(),
  ]);
  const totalLeads =
    on("kpis") && has("leads.view") ? await total(adminDb.from(tbl(schema.leads)).select("id", { count: "exact", head: true }).is("deleted_at", null).is("archived_at", null)) : 0;

  const startOfToday = new Date(`${today}T00:00:00+05:45`);
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000);
  const overdueF = followups?.filter((x) => x.f.dueAt < startOfToday) ?? [];
  const todayF = followups?.filter((x) => x.f.dueAt >= startOfToday && x.f.dueAt < endOfToday) ?? [];
  const soonF = followups?.filter((x) => x.f.dueAt >= endOfToday) ?? [];

  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kathmandu" }).format(new Date())}
        title={`Namaste, ${user.name.split(" ")[0]}`}
        description="Here's how the business is doing."
        actions={
          <>
            <RangeFilter />
            <DashboardCustomizer current={chosen} available={visible.map(({ key, label }) => ({ key, label }))} />
          </>
        }
      />

      {/* Mobile quick actions */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:hidden">
        {has("leads.create") && (
          <LinkButton href="/admin/leads/new" icon={UserPlus} className="h-11">
            New lead
          </LinkButton>
        )}
        {has("bookings.create") && (
          <LinkButton href="/admin/bookings/new" icon={CalendarCheck} className="h-11">
            New booking
          </LinkButton>
        )}
        {has("payments.create") && (
          <LinkButton href="/admin/payments/new" icon={Wallet} className="h-11">
            Add payment
          </LinkButton>
        )}
        {has("cms.manage") && (
          <LinkButton href="/admin/website/gallery" icon={Boxes} className="h-11">
            Add gallery
          </LinkButton>
        )}
      </div>

      <div className="space-y-5">
        {kpis && (
          <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {has("leads.view") && <Kpi label="Total leads" value={totalLeads} hint={`${kpis.leadsNow} new · ${range.label.toLowerCase()}`} change={pctChange(kpis.leadsNow, kpis.leadsPrev)} icon={UserPlus} href="/admin/leads" />}
            {has("leads.view") && <Kpi label="New inquiries" value={kpis.inquiriesNow} change={pctChange(kpis.inquiriesNow, kpis.inquiriesPrev)} hint={<span className="sr-only">{range.label}</span>} icon={Inbox} href="/admin/inquiries" />}
            {has("bookings.view") && <Kpi label="Active bookings" value={kpis.active} hint={`${kpis.bookingsNow} new · ${range.label.toLowerCase()}`} icon={CalendarCheck} href="/admin/bookings" />}
            {has("events.view") && <Kpi label="Upcoming events" value={kpis.upcoming} hint="Next 30 days" icon={CalendarDays} href="/admin/calendar" />}
            {has("payments.view") && <Kpi label="Revenue" value={nprCompact(kpis.revenueRange)} change={pctChange(kpis.revenueRange, kpis.revenuePrev)} hint={`${nprCompact(kpis.monthRevenue)} this month`} icon={TrendingUp} href="/admin/payments" />}
            {has("payments.view") && <Kpi label="Outstanding payments" value={nprCompact(kpis.outstanding.amount)} hint={`${kpis.outstanding.bookings} booking${kpis.outstanding.bookings === 1 ? "" : "s"}`} icon={AlertTriangle} href="/admin/invoices?status=open" />}
            {has("quotations.view") && <Kpi label="Pending quotations" value={kpis.pendingQuotes.c} hint={`${nprCompact(kpis.pendingQuotes.v)} awaiting reply`} icon={FileText} href="/admin/quotations?status=open" />}
            {has("inventory.view") && <Kpi label="Low stock items" value={lowStock?.length ?? 0} hint="Below their threshold" icon={Boxes} href="/admin/inventory?stock=low" />}
          </section>
        )}

        <div className="grid gap-5 xl:grid-cols-3">
          {months && (
            <Card title="Revenue" description="Payments received, last 12 months" className="xl:col-span-2" order={pos("revenue")}>
              <ColumnChart labels={months.map((m) => m.label)} series={[{ name: "Revenue", values: months.map((m) => m.revenue) }]} format="npr" ariaLabel="Revenue by month" />
            </Card>
          )}

          {funnel && (
            <Card title="Lead conversion" description={`Leads created in ${range.label.toLowerCase()}`} order={pos("conversion")}>
              {funnel[0].value === 0 ? <EmptyState compact title="No leads in this period" /> : <Funnel stages={funnel} ariaLabel="Lead conversion funnel" />}
            </Card>
          )}

          {pipeline && (
            <Card title="Sales pipeline" description="Open leads by stage, right now" actions={<LinkButton href="/admin/pipeline" size="sm" variant="ghost">Board</LinkButton>} order={pos("pipeline")}>
              <BarList items={pipeline.map((s) => ({ label: s.name, value: s.leads }))} format="leads" ariaLabel="Leads per pipeline stage" max={8} empty="No leads yet." />
            </Card>
          )}

          {upcoming && (
            <Card title="Upcoming events" actions={<LinkButton href="/admin/calendar" size="sm" variant="ghost">Calendar</LinkButton>} order={pos("upcoming")}>
              {upcoming.length === 0 ? (
                <EmptyState compact icon={CalendarDays} title="No upcoming events" action={has("bookings.create") ? <LinkButton href="/admin/bookings/new" size="sm">Create booking</LinkButton> : undefined} />
              ) : (
                <ul className="divide-y divide-a-border">
                  {upcoming.map(({ e, customer }) => {
                    const days = Math.round((new Date(e.eventDate).getTime() - new Date(today).getTime()) / 86_400_000);
                    return (
                      <li key={e.id}>
                        <Link href={`/admin/events/${e.id}`} className="flex items-center gap-3 py-2 hover:bg-a-subtle/50">
                          <div className="flex w-11 shrink-0 flex-col items-center rounded-md border border-a-border py-1 leading-none">
                            <span className="text-[10px] text-a-muted uppercase">{new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(e.eventDate))}</span>
                            <span className="font-serif text-lg font-medium">{e.eventDate.slice(8)}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">{e.title}</p>
                            <p className="truncate text-xs text-a-muted">{[customer, e.venue].filter(Boolean).join(" · ")}</p>
                          </div>
                          <Badge tone={days <= 3 ? "warning" : "neutral"} icon={false}>
                            {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}
                          </Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {inquiries && (
            <Card title="Recent inquiries" actions={<LinkButton href="/admin/inquiries" size="sm" variant="ghost">All</LinkButton>} order={pos("inquiries")}>
              {inquiries.length === 0 ? (
                <EmptyState compact icon={Inbox} title="No inquiries yet" />
              ) : (
                <ul className="divide-y divide-a-border">
                  {inquiries.map((i) => (
                    <li key={i.id}>
                      <Link href={`/admin/inquiries/${i.id}`} className="flex items-center justify-between gap-3 py-2 text-[13px] hover:bg-a-subtle/50">
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 truncate font-medium">
                            {!i.readAt && <span className="size-2 shrink-0 rounded-full bg-a-info" aria-label="Unread" />}
                            {i.name}
                          </span>
                          <span className="block truncate text-xs text-a-muted">
                            {eventTypeName(types, i.eventType)} · {relativeTime(i.createdAt)}
                          </span>
                        </span>
                        <StatusBadge map={INQUIRY_STATUS} value={i.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {followups && (
            <Card title="Pending follow-ups" actions={<LinkButton href="/admin/follow-ups" size="sm" variant="ghost">All</LinkButton>} order={pos("followups")}>
              {followups.length === 0 ? (
                <EmptyState compact title="You're all caught up">
                  No follow-ups due this week.
                </EmptyState>
              ) : (
                <div className="space-y-4">
                  {(
                    [
                      ["Overdue", overdueF, "danger"],
                      ["Today", todayF, "accent"],
                      ["Upcoming", soonF, "neutral"],
                    ] as const
                  ).map(([label, list, tone]) =>
                    list.length ? (
                      <div key={label}>
                        <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-a-muted uppercase">
                          {label}
                          <Badge tone={tone} icon={false}>
                            {list.length}
                          </Badge>
                        </p>
                        <ul className="divide-y divide-a-border">
                          {list.slice(0, 4).map(({ f, lead }) => (
                            <li key={f.id} className="py-1.5">
                              <Link href={lead?.id ? `/admin/leads/${lead.id}` : "/admin/follow-ups"} className="flex items-center justify-between gap-2 text-[13px] hover:underline">
                                <span className="truncate">
                                  <span className="font-medium">{lead?.name ?? "Customer"}</span> · {f.type.toLowerCase()}
                                </span>
                                <span className="shrink-0 text-xs text-a-muted">{label === "Today" ? fmtTime(f.dueAt) : fmtDay(f.dueAt)}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </Card>
          )}

          {on("inventory") && lowStock && (
            <Card title="Inventory alerts" actions={<LinkButton href="/admin/inventory?stock=low" size="sm" variant="ghost">All</LinkButton>} order={pos("inventory")}>
              {lowStock.length === 0 ? (
                <EmptyState compact icon={Boxes} title="Stock levels look healthy" />
              ) : (
                <ul className="divide-y divide-a-border">
                  {lowStock.slice(0, 6).map((i) => (
                    <li key={i.id}>
                      <Link href={`/admin/inventory/${i.id}`} className="flex items-center justify-between gap-3 py-2 text-[13px] hover:bg-a-subtle/50">
                        <span className="min-w-0 truncate font-medium">{i.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-a-muted tabular-nums">
                            {i.available} / {i.lowStockThreshold}
                          </span>
                          <Badge tone="warning" icon={AlertTriangle}>
                            Low stock
                          </Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {payments && (
            <Card title="Recent payments" actions={<LinkButton href="/admin/payments" size="sm" variant="ghost">All</LinkButton>} order={pos("payments")}>
              {payments.length === 0 ? (
                <EmptyState compact icon={Wallet} title="No payments yet" />
              ) : (
                <ul className="divide-y divide-a-border">
                  {payments.map(({ p, customer }) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{customer}</span>
                        <span className="block text-xs text-a-muted">
                          {p.number} · {fmtDate(p.paidAt)} · {p.method.toLowerCase().replace("_", " ")}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{npr(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {outstanding && (
            <Card title="Outstanding payments" description={`${npr(outstanding.total)} across ${outstanding.count} booking${outstanding.count === 1 ? "" : "s"}`} order={pos("outstanding")}>
              {outstanding.rows.length === 0 ? (
                <EmptyState compact title="No outstanding payments" />
              ) : (
                <ul className="divide-y divide-a-border">
                  {outstanding.rows.map((r) => (
                    <li key={r.id}>
                      <Link href={`/admin/bookings/${r.id}?tab=payments`} className="flex items-center justify-between gap-3 py-2 text-[13px] hover:bg-a-subtle/50">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.customer}</span>
                          <span className="block text-xs text-a-muted">
                            {r.number} · event {fmtDate(r.eventDate)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold tabular-nums">{npr(r.balance)}</span>
                          {r.overdue && (
                            <Badge tone="danger" className="mt-0.5">
                              Overdue
                            </Badge>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {activity && (
            <Card title="Recent activity" actions={<LinkButton href="/admin/activity" size="sm" variant="ghost">All</LinkButton>} order={pos("activity")}>
              {activity.length === 0 ? (
                <EmptyState compact title="No activity yet" />
              ) : (
                <ol className="space-y-2.5">
                  {activity.map((a) => (
                    <li key={a.id} className="text-[13px]">
                      <span className="font-medium">{a.userName}</span> <span className="text-a-muted">{a.summary}</span>
                      <span className="block text-xs text-a-muted" title={fmtDateTime(a.createdAt)}>
                        {relativeTime(a.createdAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

async function outstandingList() {
  const today = todayISO();
  const raw = await all<{
    id: string;
    number: string;
    total: number;
    paid: number;
    deposit: number;
    depositDue: string | null;
    balanceDue: string | null;
    c: { name: string };
    events: { eventDate: string }[];
  }>(() =>
    adminDb
      .from(tbl(schema.bookings))
      .select(
        "id,number,total:total_amount,paid:amount_paid,deposit:deposit_amount,depositDue:deposit_due_date,balanceDue:balance_due_date,c:customers!inner(name),events(eventDate:event_date)",
      )
      .neq("status", "CANCELLED")
      .order("id"),
  );
  const rows = raw
    .filter((r) => r.total > r.paid)
    .map(({ c, events, ...r }) => ({ ...r, customer: c.name, eventDate: events[0]?.eventDate ?? null }));
  const list = rows
    .map((r) => ({
      ...r,
      balance: r.total - r.paid,
      overdue: (!!r.depositDue && r.depositDue < today && r.paid < r.deposit) || (!!r.balanceDue && r.balanceDue < today),
    }))
    .sort((a, c) => Number(c.overdue) - Number(a.overdue) || (a.eventDate ?? "").localeCompare(c.eventDate ?? ""));
  const totals = await outstandingTotal();
  return { rows: list.slice(0, 5), total: totals.amount, count: totals.bookings };
}
