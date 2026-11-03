"use client";

import Link from "@/components/admin/Link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink, LoaderCircle, MapPin, UserRound } from "lucide-react";
import { calendarEvents, type CalendarEvent } from "@/app/admin/(panel)/calendar-actions";
import { cn } from "@/lib/utils";
import { Button, Dialog, inputClass } from "./interactive";
import { EVENT_STATUS, StatusBadge } from "./status";
import { buttonClass, ProgressBar } from "./ui";

/*
 * The dashboard calendar: a popup over the dashboard showing the real event records (the same rows
 * as the Events module) by month, week or as an upcoming list. Viewing and navigation only —
 * dates are changed from the event workspace, where the edit is authorised and audited.
 */

type View = "month" | "week" | "upcoming";

const DAY = 86_400_000;
const UPCOMING_DAYS = 60;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const add = (s: string, days: number) => iso(new Date(parse(s).getTime() + days * DAY));
const weekday = (s: string) => (parse(s).getUTCDay() + 6) % 7; // Monday = 0
const firstOfMonth = (s: string) => `${s.slice(0, 8)}01`;
const addMonths = (s: string, n: number) => {
  const d = parse(firstOfMonth(s));
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
};
const fmt = (s: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(parse(s));
/** Today in Nepal, as YYYY-MM-DD. */
const nepalToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
const time = (t: string | null) => (t ? t.slice(0, 5) : null);

function rangeFor(view: View, anchor: string, today: string) {
  if (view === "month") {
    const first = firstOfMonth(anchor);
    const next = addMonths(first, 1);
    return { from: add(first, -weekday(first)), to: add(next, (7 - weekday(next)) % 7), title: fmt(first, { month: "long", year: "numeric" }) };
  }
  if (view === "week") {
    const from = add(anchor, -weekday(anchor));
    return { from, to: add(from, 7), title: `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(add(from, 6), { day: "numeric", month: "short", year: "numeric" })}` };
  }
  return { from: today, to: add(today, UPCOMING_DAYS), title: `Next ${UPCOMING_DAYS} days` };
}

/** Chip colours follow the event status. */
function chipClass(status: string) {
  switch (status) {
    case "PLANNING":
      return "bg-a-info-soft text-a-info";
    case "READY":
      return "bg-a-success-soft text-a-success";
    case "IN_PROGRESS":
      return "bg-a-gold-soft text-a-gold";
    case "CANCELLED":
      return "bg-a-subtle text-a-muted line-through";
    default:
      return "bg-a-subtle text-a-text";
  }
}
function dotClass(status: string) {
  switch (status) {
    case "PLANNING":
      return "bg-a-info";
    case "READY":
      return "bg-a-success";
    case "IN_PROGRESS":
      return "bg-a-gold";
    case "CANCELLED":
      return "bg-a-strong";
    default:
      return "bg-a-muted";
  }
}

const pct = (e: CalendarEvent) => (e.tasks.total ? Math.round((e.tasks.done / e.tasks.total) * 100) : 0);

export default function CalendarButton({ className, label = "Calendar" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button icon={CalendarDays} className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {label}
      </Button>
      {open && <CalendarPopup onClose={() => setOpen(false)} />}
    </>
  );
}

function CalendarPopup({ onClose }: { onClose: () => void }) {
  const [today] = useState(nepalToday);
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState<string>(today);
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [cache, setCache] = useState<Record<string, CalendarEvent[]>>({});
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => rangeFor(view, anchor, today), [view, anchor, today]);
  const key = `${range.from}:${range.to}`;
  const loaded = cache[key];

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (loaded) return;
    let live = true;
    const { from, to } = range;
    calendarEvents({ from, to })
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          setCache((c) => ({ ...c, [`${from}:${to}`]: r.data }));
          setError(null);
        } else setError(r.error);
      })
      .catch(() => live && setError("Couldn't reach the server. Check your connection and try again."));
    return () => {
      live = false;
    };
  }, [loaded, range, attempt]);

  const events = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (loaded ?? []).filter(
      (e) =>
        (!type || e.eventType === type) &&
        (status ? e.status === status : view !== "upcoming" || e.status !== "CANCELLED") &&
        (!term || [e.title, e.customer, e.venue, e.bookingNumber].some((v) => v?.toLowerCase().includes(term))),
    );
  }, [loaded, q, type, status, view]);
  // Type filter offers the types present in what's loaded (plus the one chosen)
  const typeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of loaded ?? []) if (e.eventType) m.set(e.eventType, e.eventTypeLabel);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [loaded]);

  const on = (d: string) => events.filter((e) => e.eventDate === d);
  const days: string[] = [];
  if (view !== "upcoming") for (let d = range.from; d < range.to; d = add(d, 1)) days.push(d);

  function move(step: -1 | 1) {
    const next = view === "month" ? addMonths(anchor, step) : add(anchor, 7 * step);
    setAnchor(next);
    setSelected(view === "month" ? (firstOfMonth(next) === firstOfMonth(today) ? today : firstOfMonth(next)) : add(next, -weekday(next)));
  }
  function goToday() {
    setAnchor(today);
    setSelected(today);
  }

  return (
    <>
      <Dialog open onClose={onClose} size="xl" title="Event calendar" description="Booked events from the Events module. Open an event to see its details.">
        <div className="space-y-3">
          {/* Navigation + view switch */}
          <div className="flex flex-wrap items-center gap-2">
            {view !== "upcoming" && (
              <>
                <Button size="icon-sm" icon={ChevronLeft} aria-label={view === "month" ? "Previous month" : "Previous week"} onClick={() => move(-1)} />
                <Button size="sm" onClick={goToday}>
                  Today
                </Button>
                <Button size="icon-sm" icon={ChevronRight} aria-label={view === "month" ? "Next month" : "Next week"} onClick={() => move(1)} />
              </>
            )}
            <h3 className="mr-auto ml-1 font-serif text-lg font-medium" aria-live="polite">
              {range.title}
            </h3>
            <div role="tablist" aria-label="Calendar view" className="inline-flex rounded-md border border-a-border p-0.5">
              {(["month", "week", "upcoming"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn("rounded px-2.5 py-1 text-[13px]", view === v ? "bg-a-accent text-a-on-accent" : "text-a-muted hover:bg-a-hover hover:text-a-text")}
                >
                  {v === "month" ? "Month" : v === "week" ? "Week" : "Upcoming"}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search event, client, venue or booking…" aria-label="Search events" className={inputClass} />
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Event type" className={inputClass}>
              <option value="">All event types</option>
              {typeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Event status" className={inputClass}>
              <option value="">{view === "upcoming" ? "All active statuses" : "All statuses"}</option>
              {Object.entries(EVENT_STATUS).map(([value, def]) => (
                <option key={value} value={value}>
                  {def.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-a-danger-soft px-3 py-2 text-[13px] text-a-danger">
              {error}
              <Button
                size="sm"
                onClick={() => {
                  setError(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </Button>
            </p>
          )}
          {!loaded && !error && (
            <p className="flex items-center gap-2 py-10 text-[13px] text-a-muted justify-center">
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading events…
            </p>
          )}

          {loaded && view === "month" && (
            <>
              <div className="overflow-hidden rounded-lg border border-a-border">
                <div className="grid grid-cols-7 border-b border-a-border bg-a-subtle/50 text-center text-[11px] font-semibold tracking-wide text-a-muted uppercase">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <div key={d} className="py-1.5">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map((d) => {
                    const list = on(d);
                    const outside = firstOfMonth(d) !== firstOfMonth(anchor);
                    const isSel = d === selected;
                    return (
                      <div key={d} className={cn("min-h-14 border-r border-b border-a-border p-1 sm:min-h-24 [&:nth-child(7n)]:border-r-0", outside && "bg-a-subtle/40", isSel && "bg-a-gold-soft/40")}>
                        <button
                          type="button"
                          onClick={() => setSelected(d)}
                          aria-pressed={isSel}
                          aria-label={`${fmt(d, { weekday: "long", day: "numeric", month: "long" })}${list.length ? `, ${list.length} event${list.length === 1 ? "" : "s"}` : ""}`}
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded-full text-xs",
                            d === today ? "bg-a-accent font-semibold text-a-on-accent" : outside ? "text-a-muted hover:bg-a-hover" : "hover:bg-a-hover",
                          )}
                        >
                          {Number(d.slice(8))}
                        </button>
                        {/* Phones: a dot per event; larger screens: the event names */}
                        {list.length > 0 && (
                          <span className="mt-0.5 flex flex-wrap gap-0.5 px-0.5 sm:hidden" aria-hidden>
                            {list.slice(0, 4).map((e) => (
                              <span key={e.id} className={cn("size-1.5 rounded-full", dotClass(e.status))} />
                            ))}
                          </span>
                        )}
                        <ul className="mt-0.5 hidden space-y-0.5 sm:block">
                          {list.slice(0, 3).map((e) => (
                            <li key={e.id}>
                              <button type="button" onClick={() => setDetail(e)} title={e.title} className={cn("block w-full truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight", chipClass(e.status))}>
                                {time(e.startTime) && <span className="mr-0.5 font-semibold">{time(e.startTime)}</span>}
                                {e.title}
                              </button>
                            </li>
                          ))}
                          {list.length > 3 && (
                            <li>
                              <button type="button" onClick={() => setSelected(d)} className="px-1 text-[11px] text-a-muted hover:underline">
                                +{list.length - 3} more
                              </button>
                            </li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
              <DayList day={selected} events={on(selected)} today={today} onOpen={setDetail} />
            </>
          )}

          {loaded && view === "week" && (
            <div className="space-y-2">
              {days.map((d) => (
                <DayList key={d} day={d} events={on(d)} today={today} onOpen={setDetail} compact />
              ))}
            </div>
          )}

          {loaded && view === "upcoming" && (
            <div className="space-y-2">
              {events.length === 0 ? (
                <p className="rounded-lg border border-dashed border-a-border px-4 py-8 text-center text-[13px] text-a-muted">No events in the next {UPCOMING_DAYS} days{q || type || status ? " match these filters" : ""}.</p>
              ) : (
                [...new Set(events.map((e) => e.eventDate))].map((d) => <DayList key={d} day={d} events={on(d)} today={today} onOpen={setDetail} compact />)
              )}
            </div>
          )}

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-a-muted">
            {(["PLANNING", "READY", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className={cn("size-2 rounded-full", dotClass(s))} aria-hidden /> {EVENT_STATUS[s]!.label}
              </span>
            ))}
          </p>
        </div>
      </Dialog>
      {detail && <EventDetail event={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function DayList({ day, events, today, onOpen, compact }: { day: string; events: CalendarEvent[]; today: string; onOpen: (e: CalendarEvent) => void; compact?: boolean }) {
  return (
    <section aria-label={fmt(day, { weekday: "long", day: "numeric", month: "long" })} className="rounded-lg border border-a-border">
      <h4 className={cn("border-b border-a-border px-3 py-1.5 text-[13px] font-semibold", day === today && "text-a-accent")}>
        {fmt(day, { weekday: "long", day: "numeric", month: "long" })}
        {day === today && " · Today"}
      </h4>
      {events.length === 0 ? (
        <p className={cn("px-3 text-[13px] text-a-muted", compact ? "py-1.5" : "py-3")}>No events.</p>
      ) : (
        <ul className="divide-y divide-a-border">
          {events.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onOpen(e)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-a-subtle/60">
                <span className="w-11 shrink-0 text-xs font-semibold text-a-muted tabular-nums">{time(e.startTime) ?? "All day"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.title}</span>
                  <span className="block truncate text-xs text-a-muted">{[e.customer, e.venue, e.eventTypeLabel].filter(Boolean).join(" · ")}</span>
                </span>
                {e.tasks.total > 0 && (
                  <span className="text-xs text-a-muted tabular-nums" title={`${e.tasks.done} of ${e.tasks.total} tasks done`}>
                    {pct(e)}%
                  </span>
                )}
                <StatusBadge map={EVENT_STATUS} value={e.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventDetail({ event: e, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const place = [e.venue, e.venueAddress].filter(Boolean).join(", ");
  const rows: [string, ReactNode][] = [
    ["Client", e.customer ?? "Internal event"],
    ["Event type", e.eventTypeLabel],
    ["Date", fmt(e.eventDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })],
    ["Time", time(e.startTime) ? `${time(e.startTime)}${time(e.endTime) ? ` – ${time(e.endTime)}` : ""}` : "Not set"],
    ["Venue", place || "Not set"],
    ["Booking", e.bookingNumber ?? "—"],
    ["Event manager", e.manager ?? "Not assigned"],
  ];
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={e.title}
      description={<StatusBadge map={EVENT_STATUS} value={e.status} />}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Link href={`/admin/events/${e.id}`} className={buttonClass("primary")}>
            <ExternalLink className="size-4" aria-hidden /> Open event workspace
          </Link>
        </>
      }
    >
      <dl className="space-y-2 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2">
            <dt className="text-a-muted">{k}</dt>
            <dd className="min-w-0 break-words">
              {k === "Time" && <Clock className="mr-1 inline size-3.5 text-a-muted" aria-hidden />}
              {k === "Venue" && place && <MapPin className="mr-1 inline size-3.5 text-a-muted" aria-hidden />}
              {k === "Event manager" && e.manager && <UserRound className="mr-1 inline size-3.5 text-a-muted" aria-hidden />}
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-lg border border-a-border p-3">
        <div className="mb-1.5 flex justify-between text-[13px]">
          <span className="font-medium">Task progress</span>
          <span className="text-a-muted tabular-nums">{e.tasks.total ? `${e.tasks.done} of ${e.tasks.total} · ${pct(e)}%` : "No tasks yet"}</span>
        </div>
        <ProgressBar value={e.tasks.done} max={e.tasks.total} label="Tasks completed" tone={e.tasks.total && e.tasks.done === e.tasks.total ? "success" : e.tasks.overdue ? "warning" : "accent"} />
        {e.tasks.overdue > 0 && (
          <p className="mt-1.5 text-xs font-medium text-a-danger">
            {e.tasks.overdue} task{e.tasks.overdue === 1 ? " is" : "s are"} overdue
          </p>
        )}
        <p className="mt-1.5 text-[11px] text-a-muted">Completed tasks out of all tasks, not counting cancelled ones.</p>
      </div>
    </Dialog>
  );
}
