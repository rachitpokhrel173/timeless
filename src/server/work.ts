import "server-only";
import { adminDb, exec, many, maybe, schema, tbl, vals } from "@/db";
import { DEFAULT_WORK_PLANS, type WorkPlan } from "@/lib/defaults";
import { fmtDate } from "@/lib/format";
import { notify } from "./notifications";
import { signedUrl } from "./storage";

/*
 * Work orders: the décor team's dated tasks for an event.
 *   • A work plan (Settings → Work plans) is a list of steps relative to the event day.
 *     Applying it to an event creates tasks with real due dates.
 *   • Steps carry a team role; tasks go to the event team member with that role
 *     (the least-loaded one when several share it), now or when they join the team later.
 * System work — runs with the service-role client after the caller's permission check.
 */

export const WORK_PLANS_KEY = "work_plans";

export async function getWorkPlans(): Promise<WorkPlan[]> {
  const row = await maybe<{ value: { plans?: WorkPlan[] } }>(adminDb.from(tbl(schema.siteSettings)).select("value").eq("key", WORK_PLANS_KEY));
  return row?.value?.plans ?? DEFAULT_WORK_PLANS;
}

/** The plan for this event type, else the plan for every type. */
export function planForType(plans: WorkPlan[], eventType?: string | null) {
  return plans.find((p) => !!eventType && p.eventTypes.includes(eventType)) ?? plans.find((p) => !p.eventTypes.length) ?? null;
}

/** Due date of a plan step in Nepal time: `day` days from the event date, at `time`. */
export function stepDue(eventDate: string, day: number, time: string) {
  const base = new Date(`${eventDate}T${/^\d{2}:\d{2}$/.test(time) ? time : "10:00"}:00+05:45`);
  return new Date(base.getTime() + day * 86_400_000);
}

export const dayLabel = (day: number | null | undefined) => (day == null ? null : day === 0 ? "Event day" : day < 0 ? `${-day} day${day === -1 ? "" : "s"} before` : `${day} day${day === 1 ? "" : "s"} after`);

const sameRole = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

type Member = { staffId: string; name: string; role: string | null };

async function teamOf(eventId: string): Promise<Member[]> {
  const rows = await many<{ staffId: string; role: string | null; s: { name: string; role: string | null } }>(
    adminDb.from(tbl(schema.staffAssignments)).select("staffId:staff_id,role,s:staff!inner(name,role)").eq("event_id", eventId).order("created_at"),
  );
  return rows.map((r) => ({ staffId: r.staffId, name: r.s.name, role: r.role ?? r.s.role }));
}

/** Least-loaded team member with the role. */
function pick(team: Member[], role: string | null, load: Map<string, number>) {
  const fits = team.filter((m) => sameRole(m.role, role));
  if (!fits.length) return null;
  const best = fits.reduce((a, b) => ((load.get(b.staffId) ?? 0) < (load.get(a.staffId) ?? 0) ? b : a));
  load.set(best.staffId, (load.get(best.staffId) ?? 0) + 1);
  return best.staffId;
}

/** Sign-in accounts linked to team member records (staff id → user id). */
export async function usersForStaff(staffIds: string[]) {
  const ids = [...new Set(staffIds)];
  if (!ids.length) return new Map<string, string>();
  const rows = await many<{ id: string; staffId: string }>(adminDb.from(tbl(schema.profiles)).select("id,staffId:staff_id").in("staff_id", ids).eq("active", true));
  return new Map(rows.map((r) => [r.staffId, r.id]));
}

type EventInfo = { id: string; title: string; eventDate: string; eventType: string | null; status: string };
export const eventInfo = (id: string) => maybe<EventInfo>(adminDb.from(tbl(schema.events)).select("id,title,eventDate:event_date,eventType:event_type,status").eq("id", id));

/** Tell each team member how many tasks they were just given on an event. */
export async function notifyWork(event: { id: string; title: string; eventDate: string }, perStaff: Map<string, number>) {
  const users = await usersForStaff([...perStaff.keys()]);
  for (const [staffId, count] of perStaff) {
    const userId = users.get(staffId);
    if (!userId || !count) continue;
    await notify({
      type: "task.assigned",
      title: `${count} task${count === 1 ? "" : "s"} for ${event.title}`,
      body: `Event on ${fmtDate(event.eventDate)} — see My work for the schedule.`,
      href: "/admin/my-work",
      userId,
      entityType: "event",
      entityId: event.id,
    });
  }
}

/**
 * Add a work plan's steps to an event as tasks (steps already on the event, by title, are skipped).
 * Returns null when there's no plan to apply.
 */
export async function applyWorkPlan(eventId: string, opts: { planId?: string | null; actorId?: string | null; autoAssign?: boolean } = {}) {
  const event = await eventInfo(eventId);
  if (!event) return null;
  const plans = await getWorkPlans();
  const plan = opts.planId ? plans.find((p) => p.id === opts.planId) : planForType(plans, event.eventType);
  if (!plan) return null;
  const existing = await many<{ title: string; assigneeStaffId: string | null; position: number }>(
    adminDb.from(tbl(schema.eventTasks)).select("title,assigneeStaffId:assignee_staff_id,position").eq("event_id", eventId),
  );
  const have = new Set(existing.map((t) => t.title.trim().toLowerCase()));
  const team = opts.autoAssign === false ? [] : await teamOf(eventId);
  const load = new Map<string, number>();
  for (const t of existing) if (t.assigneeStaffId) load.set(t.assigneeStaffId, (load.get(t.assigneeStaffId) ?? 0) + 1);
  const start = Math.max(0, ...existing.map((t) => t.position + 1));

  const steps = [...plan.steps].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)).filter((s) => !have.has(s.title.trim().toLowerCase()));
  const perStaff = new Map<string, number>();
  const rows = steps.map((s, i) => {
    const staffId = pick(team, s.role, load);
    if (staffId) perStaff.set(staffId, (perStaff.get(staffId) ?? 0) + 1);
    return vals(schema.eventTasks, {
      eventId,
      title: s.title,
      description: s.details,
      teamRole: s.role,
      workDay: s.day,
      dueAt: stepDue(event.eventDate, s.day, s.time),
      priority: s.priority,
      position: start + i,
      assigneeStaffId: staffId,
      createdBy: opts.actorId ?? null,
    });
  });
  if (rows.length) await exec(adminDb.from(tbl(schema.eventTasks)).insert(rows));
  await notifyWork(event, perStaff);
  return { plan: plan.name, added: rows.length, assigned: [...perStaff.values()].reduce((a, b) => a + b, 0) };
}

/** A team member joined an event: give them the open, unassigned tasks for their role. */
export async function assignRoleTasks(eventId: string, staffId: string) {
  const member = (await teamOf(eventId)).find((m) => m.staffId === staffId);
  if (!member?.role) return 0;
  const open = await many<{ id: string; teamRole: string | null }>(
    adminDb
      .from(tbl(schema.eventTasks))
      .select("id,teamRole:team_role")
      .eq("event_id", eventId)
      .is("assignee_staff_id", null)
      .is("assignee_user_id", null)
      .not("team_role", "is", null)
      .neq("status", "COMPLETED"),
  );
  const ids = open.filter((t) => sameRole(t.teamRole, member.role)).map((t) => t.id);
  if (ids.length) await exec(adminDb.from(tbl(schema.eventTasks)).update({ assignee_staff_id: staffId }).in("id", ids));
  return ids.length;
}


/** Signed links for task proof photos (media ids → src), for pages that already checked access. */
export async function proofPhotos(ids: string[]) {
  const out = new Map<string, { src: string; alt: string }>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  const media = await many<{ id: string; bucket: string; path: string; filename: string }>(adminDb.from(tbl(schema.media)).select("id,bucket,path,filename").in("id", unique).is("deleted_at", null));
  await Promise.all(
    media.map(async (m) => {
      const src = await signedUrl(m.bucket, m.path, 3600).catch(() => null);
      if (src) out.set(m.id, { src, alt: m.filename });
    }),
  );
  return out;
}
