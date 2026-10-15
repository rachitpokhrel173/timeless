import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { adminDb, all, schema, tbl } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDateLong, fmtTime, todayISO } from "@/lib/format";
import { listParams } from "@/lib/list";
import { EVENT_STATUS, StatusBadge } from "@/components/admin/status";
import { buttonClass, Card, EmptyState, Notice, PageHeader, Tabs } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendar" };

type View = "month" | "week" | "day" | "agenda";
type Item = { id: string; date: string; kind: "event" | "task" | "deadline"; title: string; href: string; time?: string; status?: string; note?: string; tone?: "danger" | "warning" };

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const add = (s: string, days: number) => iso(new Date(parse(s).getTime() + days * DAY));
const weekday = (s: string) => (parse(s).getUTCDay() + 6) % 7; // Monday = 0
const monthName = (s: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(parse(s));
const dayLabel = (s: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(parse(s));

function range(view: View, anchor: string) {
  if (view === "month") {
    const first = `${anchor.slice(0, 8)}01`;
    const start = add(first, -weekday(first));
    const nextMonth = iso(new Date(Date.UTC(parse(first).getUTCFullYear(), parse(first).getUTCMonth() + 1, 1)));
    const end = add(nextMonth, (7 - weekday(nextMonth)) % 7 || 0);
    const prev = iso(new Date(Date.UTC(parse(first).getUTCFullYear(), parse(first).getUTCMonth() - 1, 1)));
    return { start, end, prev, next: nextMonth, title: monthName(first) };
  }
  if (view === "week") {
    const start = add(anchor, -weekday(anchor));
    return { start, end: add(start, 7), prev: add(start, -7), next: add(start, 7), title: `${dayLabel(start, { day: "numeric", month: "short" })} – ${dayLabel(add(start, 6), { day: "numeric", month: "short", year: "numeric" })}` };
  }
  if (view === "day") return { start: anchor, end: add(anchor, 1), prev: add(anchor, -1), next: add(anchor, 1), title: fmtDateLong(anchor) };
  return { start: anchor, end: add(anchor, 60), prev: add(anchor, -60), next: add(anchor, 60), title: `Next 60 days from ${dayLabel(anchor, { day: "numeric", month: "short" })}` };
}

export default async function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  const user = await requirePage("events.view");
  const sp = await searchParams;
  const { str } = listParams(sp);
  const view: View = (["month", "week", "day", "agenda"] as const).find((v) => v === str("view")) ?? "month";
  const today = todayISO();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(str("date") ?? "") ? str("date")! : today;
  const r = range(view, anchor);
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const startTs = new Date(`${r.start}T00:00:00+05:45`).toISOString();
  const endTs = new Date(`${r.end}T00:00:00+05:45`).toISOString();

  const [events, tasks, assignments, quotes, vendorDue, balances] = await Promise.all([
    all<{ id: string; title: string; eventDate: string; startTime: string | null; venue: string | null; status: string; startAt: string; endAt: string }>(() =>
      adminDb
        .from(tbl(schema.events))
        .select("id,title,eventDate:event_date,startTime:start_time,venue,status,startAt:start_at,endAt:end_at")
        .gte("event_date", r.start)
        .lt("event_date", r.end)
        .is("archived_at", null)
        .order("event_date")
        .order("id"),
    ),
    all<{ id: string; title: string; dueAt: string; status: string; eventId: string | null }>(() =>
      adminDb.from(tbl(schema.eventTasks)).select("id,title,dueAt:due_at,status,eventId:event_id").gte("due_at", startTs).lt("due_at", endTs).neq("status", "COMPLETED").order("due_at").order("id"),
    ),
    // Assignments on events overlapping the visible range — for double-booking warnings
    all<{ staffId: string; s: { name: string }; e: { id: string; title: string; status: string; startAt: string; endAt: string; eventDate: string } }>(() =>
      adminDb
        .from(tbl(schema.staffAssignments))
        .select("staffId:staff_id,s:staff!inner(name),e:events!inner(id,title,status,startAt:start_at,endAt:end_at,eventDate:event_date)")
        .lt("e.start_at", endTs)
        .gt("e.end_at", new Date(new Date(startTs).getTime() - DAY).toISOString())
        .neq("e.status", "CANCELLED")
        .order("id"),
    ),
    can("quotations.view")
      ? all<{ id: string; number: string; validUntil: string }>(() =>
          adminDb.from(tbl(schema.quotations)).select("id,number,validUntil:valid_until").in("status", ["SENT", "VIEWED"]).gte("valid_until", r.start).lt("valid_until", r.end).is("deleted_at", null).order("id"),
        )
      : [],
    can("vendors.view")
      ? all<{ id: string; service: string; dueDate: string; eventId: string; v: { name: string } }>(() =>
          adminDb.from(tbl(schema.vendorAssignments)).select("id,service,dueDate:due_date,eventId:event_id,v:vendors!inner(name)").in("status", ["REQUESTED", "CONFIRMED"]).gte("due_date", r.start).lt("due_date", r.end).order("id"),
        )
      : [],
    can("payments.view")
      ? all<{ id: string; number: string; balanceDueDate: string; totalAmount: number; amountPaid: number }>(() =>
          adminDb
            .from(tbl(schema.bookings))
            .select("id,number,balanceDueDate:balance_due_date,totalAmount:total_amount,amountPaid:amount_paid")
            .in("status", ["PENDING", "CONFIRMED", "IN_PROGRESS"])
            .gte("balance_due_date", r.start)
            .lt("balance_due_date", r.end)
            .order("id"),
        )
      : [],
  ]);

  // Staff on two events whose décor windows overlap
  const conflicts: { name: string; a: string; b: string; date: string }[] = [];
  const byStaff = new Map<string, typeof assignments>();
  for (const a of assignments) byStaff.set(a.staffId, [...(byStaff.get(a.staffId) ?? []), a]);
  for (const list of byStaff.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const x = list[i]!.e;
        const y = list[j]!.e;
        if (x.startAt < y.endAt && y.startAt < x.endAt) conflicts.push({ name: list[i]!.s.name, a: x.title, b: y.title, date: x.eventDate < y.eventDate ? x.eventDate : y.eventDate });
      }
  const teamCount = new Map<string, number>();
  for (const a of assignments) teamCount.set(a.e.id, (teamCount.get(a.e.id) ?? 0) + 1);
  const busyDays = new Map<string, number>();
  for (const e of events) if (e.status !== "CANCELLED") busyDays.set(e.eventDate, (busyDays.get(e.eventDate) ?? 0) + 1);

  const nepalDate = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date(ts));
  const items: Item[] = [
    ...events.map((e) => ({
      id: e.id,
      date: e.eventDate,
      kind: "event" as const,
      title: e.title,
      href: `/admin/events/${e.id}`,
      time: e.startTime?.slice(0, 5),
      status: e.status,
      note: [e.venue, teamCount.get(e.id) ? `${teamCount.get(e.id)} team` : "no team yet"].filter(Boolean).join(" · "),
    })),
    ...tasks.map((t) => ({
      id: t.id,
      date: nepalDate(t.dueAt),
      kind: "task" as const,
      title: t.title,
      href: t.eventId ? `/admin/events/${t.eventId}?tab=tasks` : "/admin/tasks",
      time: fmtTime(t.dueAt),
      tone: t.dueAt < new Date().toISOString() ? ("danger" as const) : undefined,
    })),
    ...quotes.map((q) => ({ id: q.id, date: q.validUntil, kind: "deadline" as const, title: `${q.number} expires`, href: `/admin/quotations/${q.id}`, tone: "warning" as const })),
    ...vendorDue.map((v) => ({ id: v.id, date: v.dueDate, kind: "deadline" as const, title: `Pay ${v.v.name}`, note: v.service, href: `/admin/events/${v.eventId}?tab=vendors` })),
    ...balances
      .filter((b) => b.totalAmount > b.amountPaid)
      .map((b) => ({ id: b.id, date: b.balanceDueDate, kind: "deadline" as const, title: `${b.number} balance due`, href: `/admin/bookings/${b.id}?tab=payments`, tone: "warning" as const })),
  ];
  const on = (d: string) => items.filter((i) => i.date === d).sort((a, b) => Number(b.kind === "event") - Number(a.kind === "event") || (a.time ?? "").localeCompare(b.time ?? ""));
  const href = (u: Record<string, string>) => `/admin/calendar?${new URLSearchParams({ view, date: anchor, ...u })}`;
  const days: string[] = [];
  for (let d = r.start; d < r.end; d = add(d, 1)) days.push(d);

  return (
    <>
      <PageHeader title="Calendar" description="Events, task deadlines, payments due and quotation expiries in one place." />
      {conflicts.length > 0 && (
        <div className="mb-4">
          <Notice tone="danger" title="Scheduling conflicts">
            <ul className="list-disc pl-4">
              {conflicts.slice(0, 8).map((c, i) => (
                <li key={i}>
                  {c.name} is on both {c.a} and {c.b} ({fmtDateLong(c.date)}).
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={href({ date: r.prev })} className={buttonClass("secondary", "icon")} aria-label="Previous">
          <ChevronLeft className="size-4" />
        </Link>
        <Link href={href({ date: today })} className={buttonClass("secondary")}>
          Today
        </Link>
        <Link href={href({ date: r.next })} className={buttonClass("secondary", "icon")} aria-label="Next">
          <ChevronRight className="size-4" />
        </Link>
        <h2 className="ml-2 font-serif text-xl font-medium">{r.title}</h2>
      </div>
      <Tabs
        label="Calendar view"
        active={view}
        items={(["month", "week", "day", "agenda"] as const).map((v) => ({ key: v, label: v[0]!.toUpperCase() + v.slice(1), href: `/admin/calendar?view=${v}&date=${anchor}` }))}
      />

      {view === "month" && (
        <Card bodyClassName="p-0">
          <div className="grid grid-cols-7 border-b border-a-border text-center text-xs font-semibold tracking-wide text-a-muted uppercase">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const list = on(d);
              const outside = d.slice(0, 7) !== anchor.slice(0, 7);
              return (
                <div key={d} className={cn("min-h-24 border-r border-b border-a-border p-1 sm:min-h-28 sm:p-1.5 [&:nth-child(7n)]:border-r-0", outside && "bg-a-subtle/50", (busyDays.get(d) ?? 0) > 1 && "bg-a-warning-soft/40")}>
                  <Link href={`/admin/calendar?view=day&date=${d}`} className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs", d === today ? "bg-a-accent font-semibold text-a-on-accent" : outside ? "text-a-muted" : "hover:bg-a-hover")}>
                    {Number(d.slice(8))}
                  </Link>
                  <ul className="space-y-0.5">
                    {list.slice(0, 3).map((i) => (
                      <li key={`${i.kind}-${i.id}`}>
                        <Link href={i.href} title={i.title} className={cn("block truncate rounded px-1 py-0.5 text-[11px] leading-tight", chip(i))}>
                          {i.time && <span className="mr-0.5 hidden font-semibold sm:inline">{i.time}</span>}
                          {i.title}
                        </Link>
                      </li>
                    ))}
                    {list.length > 3 && (
                      <li>
                        <Link href={`/admin/calendar?view=day&date=${d}`} className="px-1 text-[11px] text-a-muted hover:underline">
                          +{list.length - 3} more
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {(view === "week" || view === "day" || view === "agenda") && (
        <div className="space-y-3">
          {days
            .filter((d) => view !== "agenda" || on(d).length)
            .map((d) => {
              const list = on(d);
              return (
                <Card key={d} title={<span className={d === today ? "text-a-accent" : undefined}>{dayLabel(d, { weekday: "long", day: "numeric", month: "long" })}{d === today ? " · Today" : ""}</span>} bodyClassName="p-0">
                  {list.length === 0 ? (
                    <p className="px-4 py-3 text-[13px] text-a-muted">Nothing scheduled.</p>
                  ) : (
                    <ul className="divide-y divide-a-border">
                      {list.map((i) => (
                        <li key={`${i.kind}-${i.id}`}>
                          <Link href={i.href} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-a-subtle/60">
                            <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-a-muted">{i.time ?? (i.kind === "event" ? "All day" : "")}</span>
                            <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", chip(i))}>{i.kind === "event" ? "Event" : i.kind === "task" ? "Task" : "Due"}</span>
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{i.title}</span>
                              {i.note && <span className="block text-xs text-a-muted">{i.note}</span>}
                            </span>
                            {i.status && <StatusBadge map={EVENT_STATUS} value={i.status} />}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          {view === "agenda" && !items.length && <EmptyState title="Nothing in the next 60 days" />}
        </div>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-a-muted">
        <span className={cn("rounded px-1.5 py-0.5", chip({ kind: "event" } as Item))}>Event</span>
        <span className={cn("rounded px-1.5 py-0.5", chip({ kind: "task" } as Item))}>Task</span>
        <span className={cn("rounded px-1.5 py-0.5", chip({ kind: "deadline", tone: "warning" } as Item))}>Payment / quote deadline</span>
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="size-3.5" aria-hidden /> Shaded days have more than one event
        </span>
      </p>
    </>
  );
}

function chip(i: Pick<Item, "kind" | "tone" | "status">) {
  if (i.kind === "event") return i.status === "CANCELLED" ? "bg-a-subtle text-a-muted line-through" : "bg-a-gold-soft text-a-gold font-medium";
  if (i.tone === "danger") return "bg-a-danger-soft text-a-danger";
  if (i.tone === "warning") return "bg-a-warning-soft text-a-warning";
  return i.kind === "task" ? "bg-a-info-soft text-a-info" : "bg-a-subtle text-a-text";
}
