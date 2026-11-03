import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Bell, CalendarClock, CheckCircle2, ClipboardList, Eye, Hourglass, Sparkles } from "lucide-react";
import { relativeTime, serverNow, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listNotifications } from "@/server/notifications";
import { myPortalTasks, portalHref, requireStaffUser, type PortalTask } from "@/server/staff-portal";
import TaskCard from "@/components/staff/TaskCard";

export const metadata: Metadata = { title: "My work" };

const DONE_DAYS = 7;
/** YYYY-MM-DD of a moment in Nepal time. */
const npDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(d);
const ACTIVE = ["IN_PROGRESS", "WAITING_MATERIALS", "BLOCKED"];

export default async function StaffDashboard() {
  const user = await requireStaffUser();
  const now = serverNow();
  const today = todayISO();
  const [tasks, notes] = await Promise.all([myPortalTasks(user, new Date(now - DONE_DAYS * 86_400_000)), listNotifications(user, { limit: 5 })]);

  // Each task appears once, in the first group it fits
  const open = (t: PortalTask) => t.myStatus !== "COMPLETED";
  const groups: { key: string; title: string; hint?: string; icon: LucideIcon; tone?: string; match: (t: PortalTask) => boolean }[] = [
    { key: "overdue", title: "Overdue", hint: "Past the deadline — finish these first or tell the office.", icon: AlertTriangle, tone: "text-a-danger", match: (t) => open(t) && t.myStatus !== "REVIEW" && !!t.dueAt && t.dueAt.getTime() < now },
    { key: "new", title: "New assignments", hint: "Accept them so the office knows they're in hand.", icon: Sparkles, tone: "text-a-gold", match: (t) => t.myStatus === "TODO" },
    {
      key: "today",
      title: "Today",
      icon: CalendarClock,
      match: (t) => open(t) && t.myStatus !== "REVIEW" && ((!!t.dueAt && npDay(t.dueAt) === today) || t.startDate === today || t.event?.eventDate === today),
    },
    { key: "active", title: "In progress", hint: "Including work waiting for materials or on hold.", icon: Hourglass, match: (t) => ACTIVE.includes(t.myStatus) },
    { key: "review", title: "Waiting for review", hint: "Submitted — the event manager will approve or ask for changes.", icon: Eye, match: (t) => t.myStatus === "REVIEW" },
    { key: "upcoming", title: "Upcoming", hint: "Sorted by deadline.", icon: ClipboardList, match: open },
    { key: "done", title: `Completed in the last ${DONE_DAYS} days`, icon: CheckCircle2, tone: "text-a-success", match: (t) => t.myStatus === "COMPLETED" },
  ];
  const byDeadline = (a: PortalTask, b: PortalTask) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || (a.event?.eventDate ?? "").localeCompare(b.event?.eventDate ?? "");
  const placed = new Set<string>();
  const sections = groups.map((g) => {
    const list = tasks.filter((t) => !placed.has(t.id) && g.match(t)).sort(g.key === "done" ? (a, b) => (b.myCompletedAt?.getTime() ?? 0) - (a.myCompletedAt?.getTime() ?? 0) : byDeadline);
    for (const t of list) placed.add(t.id);
    return { ...g, list };
  });
  const count = (key: string) => sections.find((s) => s.key === key)!.list.length;

  const stats: [string, number, string, string?][] = [
    ["Today", count("today"), "#today"],
    ["Overdue", count("overdue"), "#overdue", count("overdue") ? "text-a-danger" : undefined],
    ["In progress", count("active"), "#active"],
    ["For review", count("review"), "#review"],
    ["Done (7 days)", count("done"), "#done"],
  ];

  return (
    <>
      <p className="text-xs font-medium tracking-wide text-a-muted uppercase">
        {new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kathmandu" }).format(new Date(now))}
      </p>
      <h1 className="mt-1 font-serif text-3xl font-medium">Namaste, {user.name.split(" ")[0]}</h1>
      <p className="mt-1 text-[14px] text-a-muted">Your assigned work. Accept new tasks, start them when you begin, and send photos when you finish.</p>

      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {stats.map(([label, value, href, tone]) => (
          <a key={label} href={href} className="rounded-xl border border-a-border bg-a-surface px-3 py-2.5 hover:border-a-strong">
            <span className="block text-[12px] text-a-muted">{label}</span>
            <span className={cn("block font-serif text-2xl font-medium tabular-nums", tone)}>{value}</span>
          </a>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-a-border bg-a-surface px-5 py-10 text-center">
          <ClipboardList className="mx-auto size-8 text-a-muted" aria-hidden />
          <p className="mt-2 font-medium">No work assigned to you right now</p>
          <p className="mt-1 text-[13px] text-a-muted">When the office gives you a task it appears here, and you get a notification.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {sections
            .filter((s) => s.list.length)
            .map((s) => (
              <section key={s.key} id={s.key} aria-labelledby={`h-${s.key}`} className="scroll-mt-20">
                <h2 id={`h-${s.key}`} className={cn("flex items-center gap-2 text-base font-semibold", s.tone)}>
                  <s.icon className="size-4" aria-hidden /> {s.title} <span className="font-normal text-a-muted">({s.list.length})</span>
                </h2>
                {s.hint && <p className="mt-0.5 text-[13px] text-a-muted">{s.hint}</p>}
                <ul className="mt-2 space-y-2">
                  {s.list.map((t) => (
                    <TaskCard key={t.id} task={t} now={now} />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      <section aria-labelledby="h-notes" className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 id="h-notes" className="flex items-center gap-2 text-base font-semibold">
            <Bell className="size-4" aria-hidden /> Recent notifications
          </h2>
          <Link href="/staff/notifications" className="text-[13px] text-a-accent hover:underline">
            See all
          </Link>
        </div>
        {notes.length === 0 ? (
          <p className="mt-2 text-[13px] text-a-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-a-border rounded-xl border border-a-border bg-a-surface">
            {notes.map((n) => {
              const href = portalHref(n.href, user);
              const body = (
                <>
                  <span className={cn("block text-[14px]", !n.readAt && "font-semibold")}>{n.title}</span>
                  {n.body && <span className="block text-[13px] text-a-muted">{n.body}</span>}
                  <span className="block text-xs text-a-muted">{relativeTime(n.createdAt)}</span>
                </>
              );
              return (
                <li key={n.id}>
                  {href ? (
                    <Link href={href} className="block px-3.5 py-2.5 hover:bg-a-subtle/60">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-3.5 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
