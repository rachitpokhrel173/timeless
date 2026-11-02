import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Hourglass, ShieldCheck } from "lucide-react";
import { adminDb, cols, many, schema, tbl, type Row } from "@/db";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { requirePage, type SessionUser } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr, num, relativeTime, serverNow, todayISO } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { cn } from "@/lib/utils";
import { ACCOUNT_STATUS, assignableRoles, inviteIsOpen, roleList } from "@/server/staff-accounts";
import { AVAILABILITY, EMPLOYMENT_TYPES, npDay, OPEN, staffSummaries, type StaffSummary } from "@/server/staff-overview";
import { ContactButtons } from "@/components/admin/contact-links";
import { ArchivedBadge, EVENT_STATUS, PRIORITY, StatusBadge, TASK_STATUS, label } from "@/components/admin/status";
import { Avatar, Badge, Card, DetailList, EmptyState, Kpi, LinkButton, Notice, PageHeader, Tabs } from "@/components/admin/ui";
import {
  ArchiveStaffButton,
  AvailabilityButton,
  ChangeRoleButton,
  ClearAvailabilityButton,
  InviteLoginButton,
  LinkLoginButton,
  ResendInvitationButton,
  StaffButton,
  StaffPhotoButton,
  SuspendLoginButton,
  UnlinkLoginButton,
} from "../StaffClient";

export const metadata: Metadata = { title: "Team member" };

const TABS = [
  ["overview", "Overview"],
  ["login", "Login & permissions"],
  ["skills", "Skills"],
  ["availability", "Availability"],
  ["tasks", "Assigned tasks"],
  ["events", "Event history"],
  ["activity", "Activity history"],
] as const;
type Tab = (typeof TABS)[number][0];

type Work = {
  id: string;
  status: string;
  completedAt: Date | null;
  assignedAt: Date;
  t: {
    id: string;
    title: string;
    dueAt: Date | null;
    priority: string;
    workOrderId: string | null;
    reviewRequired: boolean;
    wo: { id: string; title: string } | null;
    e: { id: string; title: string; eventDate: string; venue: string | null; b: { number: string } | null } | null;
  };
};

export default async function StaffMemberPage({ params, searchParams }: PageProps<"/admin/staff/[id]">) {
  const user = await requirePage("staff.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "overview";
  const [person] = await staffSummaries({ ids: [id], includeArchived: true });
  if (!person) notFound();
  const manage = user.permissions.has("staff.manage");
  const canRates = user.permissions.has("expenses.view");
  const base = `/admin/staff/${id}`;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/staff", label: "Staff" }}
        eyebrow={[person.employeeCode, person.role ?? "Team", person.department].filter(Boolean).join(" · ")}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {person.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- small public avatar
              <img src={person.photoUrl} alt="" className="size-11 rounded-full object-cover" />
            ) : null}
            {person.name}
            {person.archivedAt && <ArchivedBadge />}
            {!person.active && !person.archivedAt && <Badge>Inactive</Badge>}
          </span>
        }
        actions={
          <>
            <ContactButtons phone={person.phone} email={person.email ?? person.login?.email ?? null} />
            {manage && <StaffPhotoButton staffId={id} hasPhoto={!!person.photoId} />}
            {manage && <ArchiveStaffButton id={id} archived={!!person.archivedAt} />}
            {manage && <StaffButton values={person} canRates={canRates} />}
          </>
        }
      />
      <Tabs active={tab} items={TABS.map(([key, l]) => ({ key, label: l, href: key === "overview" ? base : `${base}?tab=${key}` }))} />
      {tab === "overview" && <Overview person={person} canRates={canRates} />}
      {tab === "login" && <LoginTab person={person} user={user} />}
      {tab === "skills" && <SkillsTab person={person} manage={manage} canRates={canRates} />}
      {tab === "availability" && <AvailabilityTab person={person} manage={manage} />}
      {tab === "tasks" && <TasksTab staffId={id} />}
      {tab === "events" && <EventsTab staffId={id} />}
      {tab === "activity" && <ActivityTab person={person} />}
    </>
  );
}

/* ───────── Overview ───────── */

function Overview({ person: p, canRates }: { person: StaffSummary; canRates: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Active tasks" value={p.activeTasks} icon={ClipboardList} href={`/admin/staff/${p.id}?tab=tasks`} hint={p.overdueTasks ? `${p.overdueTasks} overdue` : undefined} />
        <Kpi label="Upcoming tasks" value={p.upcomingTasks} icon={Hourglass} href={`/admin/staff/${p.id}?tab=tasks`} />
        <Kpi label="Awaiting review" value={p.reviewTasks} icon={CheckCircle2} href={`/admin/staff/${p.id}?tab=tasks`} />
        <Kpi label="Upcoming events" value={p.upcomingEvents} icon={CalendarDays} href={`/admin/staff/${p.id}?tab=events`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Employee details">
          <div className="mb-4 flex items-center gap-3">
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- small public avatar
              <img src={p.photoUrl} alt="" className="size-16 rounded-full object-cover" />
            ) : (
              <Avatar name={p.name} />
            )}
            <div>
              <p className="font-serif text-lg font-medium">{p.name}</p>
              <p className="text-[13px] text-a-muted">{[p.role, p.department].filter(Boolean).join(" · ") || "No job title yet"}</p>
            </div>
          </div>
          <DetailList
            items={[
              ["Employee code", p.employeeCode],
              ["Employment", p.employmentType ? EMPLOYMENT_TYPES[p.employmentType] : null],
              ["Status", p.employment === "ARCHIVED" ? "Archived" : p.employment === "ACTIVE" ? "Active" : "Inactive"],
              ["Joined", p.joinedOn ? fmtDate(p.joinedOn) : null],
              ["Phone", p.phone],
              ["Email", p.email],
              ["Daily rate", canRates ? npr(p.dailyRate) : null],
              ["Added", fmtDate(p.createdAt)],
            ]}
          />
          {p.notes && <p className="mt-4 rounded-lg bg-a-subtle px-3 py-2 text-[13px] whitespace-pre-line">{p.notes}</p>}
        </Card>
        <div className="space-y-4">
          <Card title="Access" actions={<LinkButton href={`/admin/staff/${p.id}?tab=login`} size="sm" variant="ghost">Manage</LinkButton>}>
            <DetailList
              columns={1}
              items={[
                ["Account", <Badge key="a" tone={ACCOUNT_STATUS[p.account].tone}>{ACCOUNT_STATUS[p.account].label}</Badge>],
                ["Login", p.login?.email ?? null],
                ["Role", p.roles.map((r) => r.name).join(", ") || null],
              ]}
            />
          </Card>
          <Card title="Today">
            <DetailList
              columns={1}
              items={[
                ["Availability", <Badge key="v" tone={AVAILABILITY[p.availability].tone}>{AVAILABILITY[p.availability].label}</Badge>],
                ["Note", p.availabilityNote],
                ["Event", p.currentEvent ? `${p.currentEvent.title} · ${p.currentEvent.today ? "today" : fmtDate(p.currentEvent.eventDate)}` : null],
              ]}
            />
          </Card>
          <Card title="Skills">
            {p.skills.length ? (
              <div className="flex flex-wrap gap-1.5">
                {p.skills.map((s) => (
                  <Badge key={s} icon={false}>
                    {s}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-a-muted">No skills recorded.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ───────── Login & permissions ───────── */

async function LoginTab({ person: p, user }: { person: StaffSummary; user: SessionUser }) {
  const canInvite = user.permissions.has("staff.invite") || user.permissions.has("users.manage");
  const admin = user.permissions.has("users.manage");
  const roles = await roleList();
  const roleOptions = assignableRoles(roles, user).map((r) => ({ value: r.key, label: r.name }));
  const roleKeys = p.roles.map((r) => r.key);
  const perms = p.login
    ? (await many<{ key: string }>(adminDb.from(tbl(schema.rolePermissions)).select("key:permission_key,r:roles!inner(key)").in("r.key", roleKeys.length ? roleKeys : ["-"]))).map((r) => r.key as Permission)
    : [];
  const grouped = Object.entries(
    [...new Set(perms)].reduce<Record<string, string[]>>((acc, k) => {
      const def = PERMISSIONS[k];
      if (def) (acc[def.group] ??= []).push(def.label);
      return acc;
    }, {}),
  );
  const officeLogin = roleKeys.some((k) => k !== "STAFF");
  const mayChange = admin || !officeLogin;
  const accounts =
    !p.login && canInvite
      ? await (async () => {
          const rows = await many<{ id: string; email: string; fullName: string }>(adminDb.from(tbl(schema.profiles)).select("id,email,fullName:full_name").is("staff_id", null).eq("active", true).order("full_name").limit(500));
          const clients = new Set((await many<{ id: string }>(adminDb.from(tbl(schema.customers)).select("id:auth_user_id").not("auth_user_id", "is", null).limit(5000))).map((c) => c.id));
          return rows.filter((r) => !clients.has(r.id)).map((r) => ({ value: r.id, label: `${r.fullName || r.email} · ${r.email}` }));
        })()
      : [];
  const archived = !!p.archivedAt;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card title="Login account" description="Supabase Auth handles sign-in and passwords — nothing secret is stored here.">
          {p.account === "INVITE_FAILED" && (
            <div className="mb-4">
              <Notice tone="danger" title="The last invitation wasn't sent">
                {p.inviteError}
              </Notice>
            </div>
          )}
          {p.account === "EXPIRED" && (
            <div className="mb-4">
              <Notice tone="warning" title="The invitation link has expired">
                Invitation links last at most 24 hours. Send a new one.
              </Notice>
            </div>
          )}
          {p.account === "SUSPENDED" && (
            <div className="mb-4">
              <Notice tone="danger" title="Access suspended">
                They can&rsquo;t sign in or open anything until access is reactivated. Their history is kept.
              </Notice>
            </div>
          )}
          <DetailList
            items={[
              ["Account status", <Badge key="s" tone={ACCOUNT_STATUS[p.account].tone}>{ACCOUNT_STATUS[p.account].label}</Badge>],
              ["Login email", p.login?.email ?? null],
              ["Role", p.roles.map((r) => r.name).join(", ") || (p.login ? "No role" : null)],
              ["Invitation", p.auth?.invitedAt ? `Sent ${fmtDateTime(p.auth.invitedAt)}` : p.invitedAt ? `Sent ${fmtDateTime(p.invitedAt)}` : null],
              ["Activated", p.auth?.confirmedAt ? fmtDateTime(p.auth.confirmedAt) : p.login ? "Not yet" : null],
              ["Last sign-in", p.auth?.lastSignInAt ? relativeTime(p.auth.lastSignInAt) : p.login ? "Never" : null],
              ["Last active", p.login?.lastSeenAt ? relativeTime(p.login.lastSeenAt) : null],
            ]}
          />
          {canInvite && !archived && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-a-border pt-4">
              {!p.login ? (
                <>
                  <InviteLoginButton staffId={p.id} email={p.email} roles={roleOptions} label={p.account === "INVITE_FAILED" ? "Try the invitation again" : "Invite to sign in"} />
                  <LinkLoginButton staffId={p.id} accounts={accounts} roles={roleOptions} />
                </>
              ) : mayChange ? (
                <>
                  {inviteIsOpen(p.account) && <ResendInvitationButton staffId={p.id} />}
                  {admin && <ChangeRoleButton staffId={p.id} roles={roleOptions} current={p.roles.length === 1 ? p.roles[0]!.key : null} />}
                  <SuspendLoginButton staffId={p.id} active={p.login.active} />
                  <UnlinkLoginButton staffId={p.id} />
                </>
              ) : (
                <p className="text-[13px] text-a-muted">This login has office access — only an administrator can change it (Users &amp; Roles).</p>
              )}
            </div>
          )}
          {archived && p.login && <p className="mt-4 text-[13px] text-a-muted">Archived team member — restore them to change their login.</p>}
          {!canInvite && <p className="mt-4 text-[13px] text-a-muted">Only an administrator can invite, link or suspend logins.</p>}
        </Card>
        {p.login && (
          <Card title="What they can access" description="From their role. Every item is also enforced by the database." actions={<ShieldCheck className="size-4 text-a-muted" aria-hidden />}>
            {grouped.length === 0 ? (
              <p className="text-[13px] text-a-muted">No permissions — they can sign in but see nothing.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {grouped.map(([group, labels]) => (
                  <div key={group}>
                    <p className="mb-1 text-xs font-semibold tracking-wide text-a-muted uppercase">{group}</p>
                    <ul className="space-y-0.5 text-[13px]">
                      {labels.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
      <Card title="How logins work">
        <ol className="list-decimal space-y-2 pl-4 text-[13px] text-a-muted">
          <li>Invite them: Supabase emails a link (valid up to 24 hours).</li>
          <li>They open it and choose their own password.</li>
          <li>They sign in at the usual admin login — the Staff role lands on <strong className="text-a-text">My work</strong> with only their own tasks.</li>
          <li>Suspending access stops every request at once; unlinking keeps the account but hides this person&rsquo;s work from it.</li>
        </ol>
      </Card>
    </div>
  );
}

/* ───────── Skills ───────── */

async function SkillsTab({ person: p, manage, canRates }: { person: StaffSummary; manage: boolean; canRates: boolean }) {
  // Which kinds of work they've done (team roles on their tasks), as evidence for the skills list
  const done = await many<{ t: { teamRole: string | null } }>(
    adminDb.from(tbl(schema.eventTaskAssignees)).select("t:event_tasks!inner(teamRole:team_role)").eq("staff_id", p.id).eq("status", "COMPLETED").is("removed_at", null).limit(2000),
  );
  const byRole = Object.entries(done.reduce<Record<string, number>>((acc, d) => ((acc[d.t.teamRole ?? "General"] = (acc[d.t.teamRole ?? "General"] ?? 0) + 1), acc), {})).sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Skills" actions={manage && <StaffButton values={p} canRates={canRates} />}>
        {p.skills.length ? (
          <div className="flex flex-wrap gap-1.5">
            {p.skills.map((s) => (
              <Badge key={s} icon={false}>
                {s}
              </Badge>
            ))}
          </div>
        ) : (
          <EmptyState compact title="No skills recorded">
            Add skills with Edit — they appear in the team list and its search.
          </EmptyState>
        )}
      </Card>
      <Card title="Completed work by type" description="From finished tasks.">
        {byRole.length === 0 ? (
          <p className="text-[13px] text-a-muted">No completed tasks yet.</p>
        ) : (
          <ul className="divide-y divide-a-border text-[13px]">
            {byRole.map(([r, n]) => (
              <li key={r} className="flex justify-between py-2">
                <span>{r}</span>
                <span className="tabular-nums text-a-muted">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ───────── Availability ───────── */

async function AvailabilityTab({ person: p, manage }: { person: StaffSummary; manage: boolean }) {
  const from = todayISO();
  const until = todayISO(29);
  const [entries, shifts, tasks] = await Promise.all([
    many<Row<typeof schema.staffAvailability>>(adminDb.from(tbl(schema.staffAvailability)).select(cols(schema.staffAvailability)).eq("staff_id", p.id).gte("date", todayISO(-7)).order("date").limit(120)),
    many<{ e: { id: string; title: string; eventDate: string; status: string } }>(
      adminDb.from(tbl(schema.staffAssignments)).select("e:events!inner(id,title,eventDate:event_date,status)").eq("staff_id", p.id).gte("e.event_date", from).lte("e.event_date", until).neq("e.status", "CANCELLED"),
    ),
    many<{ t: { dueAt: string | null } }>(adminDb.from(tbl(schema.eventTaskAssignees)).select("t:event_tasks!inner(dueAt:due_at)").eq("staff_id", p.id).is("removed_at", null).in("status", OPEN).limit(2000)),
  ]);
  const days = Array.from({ length: 30 }, (_, i) => todayISO(i));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card title="Next 30 days" description="Events, open task deadlines and time off. Two events on one day are flagged.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {days.map((d) => {
            const off = entries.find((e) => e.date === d && e.status !== "AVAILABLE");
            const ev = shifts.filter((s) => s.e.eventDate === d);
            const due = tasks.filter((t) => t.t.dueAt && npDay(t.t.dueAt) === d).length;
            return (
              <div key={d} className={cn("min-h-20 rounded-lg border p-2 text-xs", off ? "border-a-warning/50 bg-a-warning-soft/40" : ev.length ? "border-a-gold/50 bg-a-gold-soft/40" : "border-a-border")}>
                <p className="font-medium">{d === from ? "Today" : fmtDate(d)}</p>
                {off && <p className="text-a-warning">{off.status === "LEAVE" ? "On leave" : "Unavailable"}</p>}
                {ev.map((s) => (
                  <Link key={s.e.id} href={`/admin/events/${s.e.id}?tab=team`} className="block truncate hover:underline" title={s.e.title}>
                    {s.e.title}
                  </Link>
                ))}
                {ev.length > 1 && (
                  <p className="flex items-center gap-1 font-medium text-a-danger">
                    <AlertTriangle className="size-3" aria-hidden /> Overlap
                  </p>
                )}
                {off && ev.length > 0 && <p className="font-medium text-a-danger">Booked while away</p>}
                {due > 0 && <p className="text-a-muted">{due} task{due === 1 ? "" : "s"} due</p>}
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Time off & exceptions" actions={manage && <AvailabilityButton staffId={p.id} />}>
        {entries.length === 0 ? (
          <p className="text-[13px] text-a-muted">Available every day.</p>
        ) : (
          <ul className="space-y-1.5 text-[13px]">
            {entries.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span>
                  {fmtDate(a.date)}
                  {a.startTime ? ` · ${a.startTime.slice(0, 5)}–${a.endTime?.slice(0, 5) ?? ""}` : ""}
                  {a.note && <span className="block text-xs text-a-muted">{a.note}</span>}
                </span>
                <span className="flex items-center gap-1">
                  <Badge tone={a.status === "AVAILABLE" ? "success" : "warning"}>{label(a.status)}</Badge>
                  {manage && <ClearAvailabilityButton id={a.id} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ───────── Assigned tasks ───────── */

const GROUPS: { key: string; title: string; statuses: string[] }[] = [
  { key: "overdue", title: "Overdue", statuses: [] },
  { key: "todo", title: "Assigned — not accepted yet", statuses: ["TODO"] },
  { key: "accepted", title: "Not started", statuses: ["ACCEPTED"] },
  { key: "progress", title: "In progress", statuses: ["IN_PROGRESS", "WAITING_MATERIALS", "BLOCKED"] },
  { key: "review", title: "Review required", statuses: ["REVIEW"] },
  { key: "done", title: "Completed", statuses: ["COMPLETED"] },
];

async function TasksTab({ staffId }: { staffId: string }) {
  const work = await many<Work>(
    adminDb
      .from(tbl(schema.eventTaskAssignees))
      .select(
        "id,status,completedAt:completed_at,assignedAt:assigned_at,t:event_tasks!inner(id,title,dueAt:due_at,priority,workOrderId:work_order_id,reviewRequired:review_required,wo:work_orders(id,title),e:events(id,title,eventDate:event_date,venue,b:bookings(number)))",
      )
      .eq("staff_id", staffId)
      .is("removed_at", null)
      .neq("status", "CANCELLED")
      .order("assigned_at", { ascending: false })
      .limit(1000),
  );
  const checklist = work.length
    ? await many<{ taskId: string; doneAt: string | null }>(adminDb.from(tbl(schema.eventTaskChecklistItems)).select("taskId:task_id,doneAt:done_at").in("task_id", [...new Set(work.map((w) => w.t.id))].slice(0, 300)))
    : [];
  const now = serverNow();
  const late = (w: Work) => OPEN.includes(w.status) && !!w.t.dueAt && new Date(w.t.dueAt).getTime() < now;
  if (!work.length)
    return (
      <Card>
        <EmptyState icon={ClipboardList} title="No tasks assigned">
          Assign work from an event&rsquo;s work board — it appears here and on their My work page.
        </EmptyState>
      </Card>
    );
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const rows = g.key === "overdue" ? work.filter(late) : work.filter((w) => g.statuses.includes(w.status) && !late(w));
        if (!rows.length) return null;
        const shown = g.key === "done" ? rows.sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)).slice(0, 30) : rows.sort((a, b) => (a.t.dueAt ? new Date(a.t.dueAt).getTime() : Infinity) - (b.t.dueAt ? new Date(b.t.dueAt).getTime() : Infinity));
        return (
          <Card key={g.key} title={<span className={cn(g.key === "overdue" && "text-a-danger")}>{g.title}</span>} description={`${rows.length} task${rows.length === 1 ? "" : "s"}${g.key === "done" && rows.length > 30 ? " · latest 30 shown" : ""}`} bodyClassName="p-0">
            <ul className="divide-y divide-a-border">
              {shown.map((w) => {
                const items = checklist.filter((c) => c.taskId === w.t.id);
                const progress = items.length ? Math.round((items.filter((i) => i.doneAt).length / items.length) * 100) : null;
                return (
                  <li key={w.id}>
                    <Link href={`/admin/my-work/${w.t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[13px] hover:bg-a-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{w.t.title}</span>
                        <span className="block truncate text-xs text-a-muted">
                          {[w.t.e?.b?.number, w.t.e?.title, w.t.e && fmtDate(w.t.e.eventDate), w.t.wo && `Work order: ${w.t.wo.title}`].filter(Boolean).join(" · ") || "General task"}
                        </span>
                      </span>
                      <span className={cn("w-36 text-xs", late(w) ? "font-medium text-a-danger" : "text-a-muted")}>{w.t.dueAt ? `Due ${fmtDateTime(w.t.dueAt)}` : "No deadline"}</span>
                      <span className="w-20 text-xs text-a-muted">{progress === null ? "" : `${progress}% checklist`}</span>
                      <StatusBadge map={PRIORITY} value={w.t.priority} />
                      <StatusBadge map={TASK_STATUS} value={w.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/* ───────── Event history ───────── */

async function EventsTab({ staffId }: { staffId: string }) {
  const [shifts, work] = await Promise.all([
    many<{ role: string | null; days: number; e: { id: string; title: string; eventDate: string; status: string; venue: string | null } }>(
      adminDb.from(tbl(schema.staffAssignments)).select("role,days,e:events!inner(id,title,eventDate:event_date,status,venue)").eq("staff_id", staffId).limit(500),
    ),
    many<{ status: string; t: { eventId: string | null; wo: { title: string } | null; e: { id: string; title: string; eventDate: string; status: string; venue: string | null } | null } }>(
      adminDb
        .from(tbl(schema.eventTaskAssignees))
        .select("status,t:event_tasks!inner(eventId:event_id,wo:work_orders(title),e:events(id,title,eventDate:event_date,status,venue))")
        .eq("staff_id", staffId)
        .is("removed_at", null)
        .limit(3000),
    ),
  ]);
  const events = new Map<string, EventRow>();
  for (const s of shifts) events.set(s.e.id, { e: s.e, role: s.role, days: Number(s.days), done: 0, pending: 0, orders: new Set() });
  for (const w of work) {
    if (!w.t.e) continue;
    const row = events.get(w.t.e.id) ?? { e: w.t.e, role: null, days: null, done: 0, pending: 0, orders: new Set<string>() };
    if (w.status === "COMPLETED") row.done++;
    else if (w.status !== "CANCELLED") row.pending++;
    if (w.t.wo) row.orders.add(w.t.wo.title);
    events.set(w.t.e.id, row);
  }
  const today = todayISO();
  const list = [...events.values()];
  const upcoming = list.filter((r) => r.e.eventDate >= today).sort((a, b) => a.e.eventDate.localeCompare(b.e.eventDate));
  const past = list.filter((r) => r.e.eventDate < today).sort((a, b) => b.e.eventDate.localeCompare(a.e.eventDate));
  const yearDays = list.filter((r) => r.e.eventDate >= todayISO(-365) && r.e.eventDate < today && r.e.status !== "CANCELLED").reduce((s, r) => s + (r.days ?? 0), 0);
  if (!list.length)
    return (
      <Card>
        <EmptyState icon={CalendarDays} title="No events yet" />
      </Card>
    );
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-a-muted">
        {list.length} event{list.length === 1 ? "" : "s"} · {num(yearDays)} event days in the last 12 months
      </p>
      <EventSection title="Upcoming" rows={upcoming} />
      <EventSection title="Past" rows={past.slice(0, 50)} />
    </div>
  );
}

type EventRow = { e: { id: string; title: string; eventDate: string; status: string; venue: string | null }; role: string | null; days: number | null; done: number; pending: number; orders: Set<string> };

function EventSection({ title, rows }: { title: string; rows: EventRow[] }) {
  return     rows.length ? (
      <Card title={title} bodyClassName="p-0">
        <ul className="divide-y divide-a-border">
          {rows.map((r) => (
            <li key={r.e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
              <Link href={`/admin/events/${r.e.id}?tab=team`} className="min-w-0 hover:underline">
                <span className="font-medium">{r.e.title}</span>
                <span className="block text-xs text-a-muted">
                  {[fmtDate(r.e.eventDate), r.e.venue, r.role && `Responsible for: ${r.role}`, r.days !== null && `${num(r.days)} day${r.days === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                </span>
                {r.orders.size > 0 && <span className="block text-xs text-a-muted">Work orders: {[...r.orders].join(", ")}</span>}
              </Link>
              <span className="flex items-center gap-3 text-xs">
                <span className="text-a-success">{r.done} done</span>
                <span className={r.pending ? "font-medium" : "text-a-muted"}>{r.pending} pending</span>
                <StatusBadge map={EVENT_STATUS} value={r.e.status} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    ) : null;
}

/* ───────── Activity history ───────── */

async function ActivityTab({ person: p }: { person: StaffSummary }) {
  const [logs, updates] = await Promise.all([
    many<{ id: string; action: string; summary: string; userName: string | null; createdAt: Date }>(
      adminDb
        .from(tbl(schema.activityLogs))
        .select("id,action,summary,userName:user_name,createdAt:created_at")
        .or(`and(entity.eq.staff,entity_id.eq.${p.id})${p.login ? `,and(entity.eq.user,entity_id.eq.${p.login.id})` : ""}`)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
    many<{ id: string; kind: string; toStatus: string | null; note: string | null; createdAt: Date; t: { id: string; title: string }; a: { fullName: string } | null }>(
      adminDb
        .from(tbl(schema.eventTaskUpdates))
        .select("id,kind,toStatus:to_status,note,createdAt:created_at,t:event_tasks!inner(id,title),a:profiles(fullName:full_name)")
        .eq("staff_id", p.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
  ]);
  const items = [
    ...logs.map((l) => ({ id: `l${l.id}`, at: l.createdAt, by: l.userName ?? "System", text: <>{l.summary}</> })),
    ...updates.map((u) => ({
      id: `u${u.id}`,
      at: u.createdAt,
      by: u.a?.fullName ?? "System",
      text: (
        <>
          {u.kind === "ASSIGNED" ? "Task assigned: " : u.kind === "UNASSIGNED" ? "Taken off task: " : `Task ${(TASK_STATUS[u.toStatus ?? ""]?.label ?? u.toStatus ?? "").toLowerCase()}: `}
          <Link href={`/admin/my-work/${u.t.id}`} className="hover:underline">
            {u.t.title}
          </Link>
          {u.note && <span className="text-a-muted"> — {u.note}</span>}
        </>
      ),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return (
    <Card title="Activity history" description="Profile, account and role changes, and their task assignments and updates — with who did it.">
      {items.length === 0 ? (
        <p className="text-[13px] text-a-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="space-y-2.5 border-l border-a-border pl-3 text-[13px]">
          {items.slice(0, 150).map((i) => (
            <li key={i.id}>
              <p className="text-xs text-a-muted">
                {fmtDateTime(i.at)} · {i.by}
              </p>
              <p>{i.text}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
