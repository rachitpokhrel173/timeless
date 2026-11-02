import "server-only";
import { adminDb, all, cols, many, schema, tbl, type Row } from "@/db";
import { todayISO } from "@/lib/format";
import { accountStatus, authInfo, rolesOf, type AccountStatus, type AuthInfo } from "./staff-accounts";

/*
 * Everything the Staff screens show about the team, from the real records: the employee row, the
 * linked login (profiles.staff_id) with its roles and Auth status, today's availability, the event
 * they're on today (or next), and their open tasks from event_task_assignees.
 * Service-role reads — callers check staff.view first.
 */

export type Availability = "AVAILABLE" | "ASSIGNED" | "UNAVAILABLE" | "LEAVE";
export const AVAILABILITY: Record<Availability, { label: string; tone: "success" | "gold" | "warning" | "danger" }> = {
  AVAILABLE: { label: "Available", tone: "success" },
  ASSIGNED: { label: "Assigned", tone: "gold" },
  UNAVAILABLE: { label: "Unavailable", tone: "warning" },
  LEAVE: { label: "On leave", tone: "danger" },
};

export const EMPLOYMENT_TYPES = { FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract", FREELANCE: "Freelance", INTERN: "Intern" } as const;

/** Statuses that still need someone to act (open work). */
export const OPEN = ["TODO", "ACCEPTED", "IN_PROGRESS", "WAITING_MATERIALS", "REVIEW", "BLOCKED"];

export type EventRef = { id: string; title: string; eventDate: string; venue: string | null; status: string };
export type Login = { id: string; email: string; active: boolean; lastSeenAt: Date | null; fullName: string };

export type StaffSummary = Row<typeof schema.staff> & {
  photoUrl: string | null;
  login: Login | null;
  auth: AuthInfo | undefined;
  roles: { key: string; name: string }[];
  account: AccountStatus;
  availability: Availability;
  availabilityNote: string | null;
  /** The event they're on today, else their next one. */
  currentEvent: (EventRef & { today: boolean }) | null;
  upcomingEvents: number;
  /** Open tasks due today or earlier (or without a deadline). */
  activeTasks: number;
  /** Open tasks due after today. */
  upcomingTasks: number;
  overdueTasks: number;
  reviewTasks: number;
  employment: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

/** Nepal-time day of a timestamp. */
export const npDay = (d: Date | string) => new Date(new Date(d).getTime() + 345 * 60_000).toISOString().slice(0, 10);

export async function staffSummaries(opts: { includeArchived?: boolean; ids?: string[] } = {}): Promise<StaffSummary[]> {
  const today = todayISO();
  const people = await all<Row<typeof schema.staff> & { photo: { url: string | null } | null }>(() => {
    let q = adminDb.from(tbl(schema.staff)).select(`${cols(schema.staff)},photo:media(url)`);
    if (opts.ids) q = q.in("id", opts.ids);
    if (!opts.includeArchived) q = q.is("archived_at", null);
    return q.order("name").order("id");
  });
  if (!people.length) return [];
  const ids = people.map((p) => p.id);

  const [logins, away, shifts, work] = await Promise.all([
    many<Login & { staffId: string }>(adminDb.from(tbl(schema.profiles)).select("id,email,active,lastSeenAt:last_seen_at,fullName:full_name,staffId:staff_id").in("staff_id", ids)),
    many<{ staffId: string; status: string; note: string | null }>(adminDb.from(tbl(schema.staffAvailability)).select("staffId:staff_id,status,note").eq("date", today).in("staff_id", ids)),
    all<{ staffId: string; e: EventRef }>(() =>
      adminDb
        .from(tbl(schema.staffAssignments))
        .select("staffId:staff_id,e:events!inner(id,title,eventDate:event_date,venue,status)")
        .in("staff_id", ids)
        .gte("e.event_date", today)
        .neq("e.status", "CANCELLED")
        .order("id"),
    ),
    all<{ staffId: string; status: string; t: { dueAt: string | null } }>(() =>
      adminDb.from(tbl(schema.eventTaskAssignees)).select("staffId:staff_id,status,t:event_tasks!inner(dueAt:due_at)").in("staff_id", ids).is("removed_at", null).in("status", OPEN).order("id"),
    ),
  ]);
  const [roles, auth] = await Promise.all([rolesOf(logins.map((l) => l.id)), authInfo(logins.map((l) => l.id))]);
  const now = Date.now();

  return people.map(({ photo, ...p }) => {
    const login = logins.find((l) => l.staffId === p.id) ?? null;
    const off = away.find((a) => a.staffId === p.id);
    const mine = shifts.filter((s) => s.staffId === p.id).sort((a, b) => a.e.eventDate.localeCompare(b.e.eventDate));
    const onToday = mine.find((s) => s.e.eventDate === today);
    const tasks = work.filter((w) => w.staffId === p.id);
    const availability: Availability = !p.active || p.archivedAt ? "UNAVAILABLE" : off?.status === "LEAVE" ? "LEAVE" : off?.status === "UNAVAILABLE" ? "UNAVAILABLE" : onToday ? "ASSIGNED" : "AVAILABLE";
    const next = onToday ?? mine[0];
    return {
      ...p,
      photoUrl: photo?.url ?? null,
      login: login ? { id: login.id, email: login.email, active: login.active, lastSeenAt: login.lastSeenAt, fullName: login.fullName } : null,
      auth: login ? auth.get(login.id) : undefined,
      roles: login ? (roles.get(login.id) ?? []) : [],
      account: accountStatus(login, login ? auth.get(login.id) : undefined, p.inviteError),
      availability,
      availabilityNote: off && off.status !== "AVAILABLE" ? off.note : null,
      currentEvent: next ? { ...next.e, today: !!onToday } : null,
      upcomingEvents: mine.length,
      activeTasks: tasks.filter((t) => !t.t.dueAt || npDay(t.t.dueAt) <= today).length,
      upcomingTasks: tasks.filter((t) => t.t.dueAt && npDay(t.t.dueAt) > today).length,
      overdueTasks: tasks.filter((t) => t.t.dueAt && new Date(t.t.dueAt).getTime() < now).length,
      reviewTasks: tasks.filter((t) => t.status === "REVIEW").length,
      employment: p.archivedAt ? "ARCHIVED" : p.active ? "ACTIVE" : "INACTIVE",
    };
  });
}
