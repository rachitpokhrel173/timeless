import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Clock, MapPin, Phone, Printer, UsersRound } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDay, fmtTime, serverNow, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dayLabel, proofPhotos } from "@/server/work";
import { FilterSelect } from "@/components/admin/interactive";
import { EVENT_STATUS, PRIORITY, StatusBadge, TASK_STATUS } from "@/components/admin/status";
import { Badge, Card, EmptyState, Kpi, LinkButton, Notice, PageHeader, Tabs } from "@/components/admin/ui";
import { WorkTaskActions } from "./WorkClient";

export const metadata: Metadata = { title: "My work" };

const DAYS = 14;
/** YYYY-MM-DD of a moment, in Nepal time. */
const npDay = (d: Date) => new Date(d.getTime() + 345 * 60_000).toISOString().slice(0, 10);
const mapLink = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

type EventLite = { id: string; title: string; eventDate: string; startTime: string | null; endTime: string | null; venue: string | null; venueAddress: string | null; status: string; startAt: Date };
type TaskRow = Row<typeof schema.eventTasks> & { e: { id: string; title: string; eventDate: string; venue: string | null } | null };
type Shift = EventLite & { role: string | null; customer: { name: string; phone: string | null } | null };

export default async function MyWorkPage({ searchParams }: PageProps<"/admin/my-work">) {
  const user = await requirePage();
  if (!user.permissions.has("events.view") && !user.permissions.has("tasks.update")) await requirePage("tasks.update");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const planner = user.permissions.has("events.update");
  const view = planner && str("view") === "team" ? "team" : "mine";

  const staff = planner ? await many<{ value: string; label: string; role: string | null }>(adminDb.from(tbl(schema.staff)).select("value:id,label:name,role").eq("active", true).is("archived_at", null).order("name")) : [];

  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kathmandu" }).format(new Date())}
        title={view === "team" ? "Team schedule" : "My work"}
        description={view === "team" ? "Who is working where over the next week. Open a person to see their full schedule." : "Your events and tasks, day by day. Start a task when you begin and mark it done with a photo when you finish."}
        actions={planner && view === "mine" && <FilterSelect param="staff" label="Team member" allLabel="Me" options={staff} />}
      />
      {planner && (
        <Tabs
          active={view}
          items={[
            { key: "mine", label: "Schedule", href: "/admin/my-work" },
            { key: "team", label: "Team board", href: "/admin/my-work?view=team" },
          ]}
        />
      )}
      {view === "team" ? <TeamBoard staff={staff} /> : <Schedule staffParam={planner ? str("staff") : null} user={user} staffNames={staff} />}
    </>
  );
}

/* ───────── One person's schedule ───────── */

async function Schedule({ staffParam, user, staffNames }: { staffParam: string | null; user: Awaited<ReturnType<typeof requirePage>>; staffNames: { value: string; label: string }[] }) {
  const viewing = staffParam && staffNames.some((s) => s.value === staffParam) ? staffParam : null;
  const staffId = viewing ?? user.staffId;
  const userId = viewing ? ((await maybe<{ id: string }>(adminDb.from(tbl(schema.profiles)).select("id").eq("staff_id", viewing).limit(1)))?.id ?? null) : user.id;
  const who = viewing ? staffNames.find((s) => s.value === viewing)!.label : null;

  const today = todayISO();
  const todayStart = new Date(`${today}T00:00:00+05:45`);
  const last = todayISO(DAYS - 1);
  const mine = [userId && `assignee_user_id.eq.${userId}`, staffId && `assignee_staff_id.eq.${staffId}`].filter(Boolean).join(",");

  const [tasks, shifts] = await Promise.all([
    mine
      ? many<TaskRow>(
          adminDb
            .from(tbl(schema.eventTasks))
            .select(`${cols(schema.eventTasks)},e:events(id,title,eventDate:event_date,venue)`)
            .or(mine)
            .or(`status.neq.COMPLETED,completed_at.gte.${new Date(todayStart.getTime() - 86_400_000).toISOString()}`)
            .order("due_at", { nullsFirst: false })
            .order("position")
            .limit(300),
        )
      : [],
    staffId
      ? many<{ role: string | null; e: EventLite & { c: { name: string; phone: string | null } | null } }>(
          adminDb
            .from(tbl(schema.staffAssignments))
            .select("role,e:events!inner(id,title,eventDate:event_date,startTime:start_time,endTime:end_time,venue,venueAddress:venue_address,status,startAt:start_at,c:customers(name,phone))")
            .eq("staff_id", staffId)
            .gte("e.event_date", todayISO(-1))
            .lte("e.event_date", last)
            .neq("e.status", "CANCELLED"),
        ).then((rows) => rows.map(({ role, e: { c, ...e } }): Shift => ({ ...e, role, customer: c })))
      : [],
  ]);

  const photos = await proofPhotos(tasks.flatMap((t) => t.proofMediaIds));
  const open = tasks.filter((t) => t.status !== "COMPLETED");
  const overdue = open.filter((t) => t.dueAt && t.dueAt < todayStart);
  const dayOf = (t: TaskRow) => (t.dueAt ? npDay(t.dueAt) : null);
  const days = Array.from({ length: DAYS }, (_, i) => todayISO(i));
  const weekEnd = todayISO(6);
  const todayCount = open.filter((t) => dayOf(t) === today).length;
  const weekCount = open.filter((t) => (dayOf(t) ?? "") >= today && (dayOf(t) ?? "") <= weekEnd).length;
  const doneToday = tasks.filter((t) => t.status === "COMPLETED" && t.completedAt && npDay(t.completedAt) === today).length;
  const later = open.filter((t) => (dayOf(t) ?? "") > last);
  const undated = open.filter((t) => !t.dueAt);
  const blocked = open.filter((t) => t.status === "BLOCKED");

  if (!staffId && !userId) return null;

  return (
    <div className="space-y-6">
      {!viewing && !user.staffId && (
        <Notice tone="warning" title="Your login isn't linked to a team member">
          Events you&apos;re on the team for won&apos;t show here until an admin links your login (Users → Team member).
        </Notice>
      )}
      {who && <Notice title={`Viewing ${who}’s schedule`}>{userId ? "They see this same page when they sign in." : "They don't have a login yet — invite them from Users so they can see their work."}</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Today" value={todayCount} icon={CalendarDays} hint={shifts.some((s) => s.eventDate === today) ? "You're at an event today" : undefined} />
        <Kpi label="Overdue" value={overdue.length} icon={AlertTriangle} hint={overdue.length ? "Finish these first" : "All caught up"} />
        <Kpi label="This week" value={weekCount} icon={ClipboardList} />
        <Kpi label="Done today" value={doneToday} icon={CheckCircle2} hint={blocked.length ? `${blocked.length} blocked` : undefined} />
      </div>

      {overdue.length > 0 && (
        <DaySection title="Overdue" tone="danger" count={overdue.length}>
          <TaskList tasks={overdue} photos={photos} showDate />
        </DaySection>
      )}

      {days.map((day, i) => {
        const dayTasks = tasks.filter((t) => dayOf(t) === day && !(t.status !== "COMPLETED" && t.dueAt && t.dueAt < todayStart));
        const dayShifts = shifts.filter((s) => s.eventDate === day);
        if (!dayTasks.length && !dayShifts.length) return null;
        const title = i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmtDay(day);
        return (
          <DaySection key={day} title={title} sub={i < 2 ? fmtDay(day) : undefined} tone={i === 0 ? "accent" : undefined} count={dayTasks.filter((t) => t.status !== "COMPLETED").length}>
            {dayShifts.map((s) => (
              <ShiftCard key={s.id} shift={s} />
            ))}
            {dayTasks.length > 0 && <TaskList tasks={dayTasks} photos={photos} />}
          </DaySection>
        );
      })}

      {later.length > 0 && (
        <DaySection title="Later" count={later.length}>
          <TaskList tasks={later} photos={photos} showDate />
        </DaySection>
      )}
      {undated.length > 0 && (
        <DaySection title="No date" count={undated.length}>
          <TaskList tasks={undated} photos={photos} />
        </DaySection>
      )}

      {!tasks.length && !shifts.length && (
        <Card>
          <EmptyState icon={ClipboardList} title="Nothing scheduled">
            No events or tasks in the next two weeks. New work shows up here — and in your notifications — as soon as it&apos;s assigned.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}

function DaySection({ title, sub, count, tone, children }: { title: string; sub?: string; count?: number; tone?: "accent" | "danger"; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={cn("mb-2 flex items-baseline gap-2 font-serif text-xl font-medium", tone === "danger" && "text-a-danger")}>
        {title}
        {sub && <span className="font-sans text-[13px] font-normal text-a-muted">{sub}</span>}
        {!!count && <Badge tone={tone === "danger" ? "danger" : tone === "accent" ? "accent" : "neutral"}>{count} open</Badge>}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ShiftCard({ shift: s }: { shift: Shift }) {
  const time = [s.startTime && s.startTime.slice(0, 5), s.endTime && s.endTime.slice(0, 5)].filter(Boolean).join(" – ");
  const place = [s.venue, s.venueAddress].filter(Boolean).join(", ");
  return (
    <div className="rounded-xl border border-a-border border-l-4 border-l-a-accent bg-a-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-a-gold uppercase">Event{s.role ? ` · you're ${s.role}` : ""}</p>
          <Link href={`/admin/events/${s.id}`} className="text-base font-semibold hover:underline">
            {s.title}
          </Link>
          <ul className="mt-1.5 space-y-1 text-[13px] text-a-muted">
            <li className="flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              Setup from {fmtTime(s.startAt)}
              {time && ` · guests ${time}`}
            </li>
            {place && (
              <li className="flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <a href={mapLink(place)} target="_blank" rel="noreferrer" className="hover:text-a-text hover:underline">
                  {place}
                </a>
              </li>
            )}
            {s.customer && (
              <li className="flex items-center gap-1.5">
                <Phone className="size-3.5 shrink-0" aria-hidden />
                {s.customer.name}
                {s.customer.phone && (
                  <a href={`tel:${s.customer.phone}`} className="font-medium text-a-text hover:underline">
                    {s.customer.phone}
                  </a>
                )}
              </li>
            )}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.status !== "PLANNING" && <StatusBadge map={EVENT_STATUS} value={s.status} />}
          <LinkButton href={`/admin/print/event/${s.id}`} size="sm" icon={Printer}>
            Day sheet
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

function TaskList({ tasks, photos, showDate }: { tasks: TaskRow[]; photos: Map<string, { src: string; alt: string }>; showDate?: boolean }) {
  const now = serverNow();
  return (
    <Card bodyClassName="p-0">
      <ul className="divide-y divide-a-border">
        {tasks.map((t) => {
          const done = t.status === "COMPLETED";
          const late = !done && t.dueAt && t.dueAt.getTime() < now;
          const pics = t.proofMediaIds.map((id) => photos.get(id)).filter((p): p is { src: string; alt: string } => !!p);
          return (
            <li key={t.id} className={cn("space-y-2 px-4 py-3", done && "bg-a-subtle/40")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className={done ? "text-a-muted line-through" : "font-medium"}>{t.title}</p>
                  <p className="mt-0.5 text-xs text-a-muted">
                    {t.dueAt && <span className={late ? "font-medium text-a-danger" : undefined}>{showDate ? `${fmtDay(t.dueAt)}, ` : ""}{fmtTime(t.dueAt)}</span>}
                    {t.e && (
                      <>
                        {t.dueAt && " · "}
                        <Link href={`/admin/events/${t.e.id}?tab=tasks`} className="hover:underline">
                          {t.e.title}
                        </Link>
                        {t.e.venue && ` · ${t.e.venue}`}
                      </>
                    )}
                    {t.teamRole && ` · ${t.teamRole}`}
                    {t.workDay != null && ` · ${dayLabel(t.workDay)}`}
                  </p>
                </div>
                <span className="flex gap-1.5">
                  {["HIGH", "URGENT"].includes(t.priority) && !done && <StatusBadge map={PRIORITY} value={t.priority} />}
                  {t.status !== "TODO" && <StatusBadge map={TASK_STATUS} value={t.status} />}
                </span>
              </div>
              {t.description && !done && <p className="text-[13px] whitespace-pre-line text-a-muted">{t.description}</p>}
              {t.status === "BLOCKED" && t.blockedReason && <p className="rounded-md bg-a-danger-soft px-3 py-2 text-[13px] text-a-danger">{t.blockedReason}</p>}
              {done && t.completionNote && <p className="text-[13px] text-a-muted">“{t.completionNote}”</p>}
              {pics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pics.map((p) => (
                    <a key={p.src} href={p.src} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed links */}
                      <img src={p.src} alt={p.alt} className="size-16 rounded-md border border-a-border object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <WorkTaskActions id={t.id} title={t.title} status={t.status} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ───────── Team board (planners) ───────── */

async function TeamBoard({ staff }: { staff: { value: string; label: string; role: string | null }[] }) {
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => todayISO(i));
  const todayStart = new Date(`${today}T00:00:00+05:45`);
  const end = new Date(`${todayISO(7)}T00:00:00+05:45`).toISOString();
  const [shifts, tasks, linked] = await Promise.all([
    many<{ staffId: string; e: { id: string; title: string; eventDate: string } }>(
      adminDb
        .from(tbl(schema.staffAssignments))
        .select("staffId:staff_id,e:events!inner(id,title,eventDate:event_date)")
        .gte("e.event_date", today)
        .lte("e.event_date", days[6]!)
        .neq("e.status", "CANCELLED"),
    ),
    many<{ staffId: string; dueAt: Date; status: string }>(
      adminDb.from(tbl(schema.eventTasks)).select("staffId:assignee_staff_id,dueAt:due_at,status").not("assignee_staff_id", "is", null).neq("status", "COMPLETED").lt("due_at", end),
    ),
    many<{ staffId: string }>(adminDb.from(tbl(schema.profiles)).select("staffId:staff_id").not("staff_id", "is", null).eq("active", true)),
  ]);
  const hasLogin = new Set(linked.map((l) => l.staffId));
  if (!staff.length)
    return (
      <Card>
        <EmptyState icon={UsersRound} title="No team members yet" action={<LinkButton href="/admin/staff">Add team members</LinkButton>}>
          Add your team under Staff, then assign them to events.
        </EmptyState>
      </Card>
    );

  return (
    <Card bodyClassName="p-0 overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="border-b border-a-border text-left text-xs text-a-muted">
            <th className="px-4 py-2 font-medium">Team member</th>
            {days.map((d, i) => (
              <th key={d} className={cn("px-2 py-2 font-medium", i === 0 && "text-a-text")}>
                {i === 0 ? "Today" : fmtDay(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-a-border">
          {staff.map((s) => {
            const late = tasks.filter((t) => t.staffId === s.value && t.dueAt < todayStart).length;
            return (
              <tr key={s.value} className="align-top">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/my-work?staff=${s.value}`} className="font-medium hover:underline">
                    {s.label}
                  </Link>
                  <p className="text-xs text-a-muted">
                    {s.role ?? "Team"}
                    {!hasLogin.has(s.value) && " · no login"}
                  </p>
                  {late > 0 && <p className="text-xs font-medium text-a-danger">{late} overdue</p>}
                </td>
                {days.map((d) => {
                  const ev = shifts.filter((x) => x.staffId === s.value && x.e.eventDate === d);
                  const n = tasks.filter((t) => t.staffId === s.value && npDay(t.dueAt) === d).length;
                  return (
                    <td key={d} className="px-2 py-2.5">
                      {ev.map((x) => (
                        <Link key={x.e.id} href={`/admin/events/${x.e.id}?tab=team`} className="mb-1 block truncate rounded bg-a-accent-soft px-1.5 py-0.5 text-xs font-medium text-a-accent hover:underline" title={x.e.title}>
                          {x.e.title}
                        </Link>
                      ))}
                      {n > 0 && (
                        <span className="text-xs text-a-muted">
                          {n} task{n === 1 ? "" : "s"}
                        </span>
                      )}
                      {ev.length > 1 && <AlertTriangle className="size-3.5 text-a-danger" aria-label="Two events this day" />}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
