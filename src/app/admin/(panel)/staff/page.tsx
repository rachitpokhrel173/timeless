import type { Metadata } from "next";
import Link from "next/link";
import { Archive, CalendarCheck2, MailQuestion, UserCheck, UsersRound, UserRoundCheck } from "lucide-react";
import { adminDb, many, schema, tbl } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr } from "@/lib/format";
import { listParams } from "@/lib/list";
import { cn } from "@/lib/utils";
import { assignableRoles, ACCOUNT_STATUS, roleList, type AccountStatus } from "@/server/staff-accounts";
import { AVAILABILITY, EMPLOYMENT_TYPES, staffSummaries, type Availability, type StaffSummary } from "@/server/staff-overview";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { Avatar, Badge, Card, EmptyState, Kpi, PageHeader, Pagination, Table, Td, Th, Toolbar } from "@/components/admin/ui";
import { AddTeamMemberButton } from "./AddTeamMember";
import { ReviewButtons } from "./StaffClient";

export const metadata: Metadata = { title: "Staff" };

const PAGE_SIZE = 20;
const SORTS = {
  name: "Name",
  title: "Job title",
  department: "Department",
  tasks: "Most active tasks",
  joined: "Newest first",
} as const;

export default async function StaffPage({ searchParams }: PageProps<"/admin/staff">) {
  const user = await requirePage("staff.view");
  const sp = await searchParams;
  const { q, str, page } = listParams(sp, PAGE_SIZE);
  const everyone = await staffSummaries({ includeArchived: true });
  const current = everyone.filter((p) => p.employment !== "ARCHIVED");

  const emp = str("emp") ?? "current";
  const filters = { dept: str("dept"), title: str("title"), role: str("role"), account: str("account"), avail: str("avail") };
  const term = q?.toLowerCase();
  const termDigits = q?.replace(/\D/g, "") ?? "";
  let shown = everyone.filter((p) => (emp === "current" ? p.employment !== "ARCHIVED" : emp === "all" ? true : p.employment === emp.toUpperCase()));
  if (term)
    shown = shown.filter(
      (p) =>
        `${p.name} ${p.email ?? ""} ${p.login?.email ?? ""} ${p.employeeCode ?? ""} ${p.role ?? ""} ${p.skills.join(" ")}`.toLowerCase().includes(term) ||
        (termDigits.length >= 4 && (p.phone ?? "").replace(/\D/g, "").includes(termDigits)),
    );
  if (filters.dept) shown = shown.filter((p) => (p.department ?? "") === filters.dept);
  if (filters.title) shown = shown.filter((p) => (p.role ?? "") === filters.title);
  if (filters.role) shown = shown.filter((p) => (filters.role === "none" ? !p.login : p.roles.some((r) => r.key === filters.role)));
  if (filters.account) shown = shown.filter((p) => (filters.account === "PENDING" ? p.account === "PENDING" || p.account === "EXPIRED" : p.account === filters.account));
  if (filters.avail) shown = shown.filter((p) => p.availability === filters.avail);
  const sort = (str("sort") ?? "name") as keyof typeof SORTS;
  const by: Record<string, (a: StaffSummary, b: StaffSummary) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    title: (a, b) => (a.role ?? "~").localeCompare(b.role ?? "~") || a.name.localeCompare(b.name),
    department: (a, b) => (a.department ?? "~").localeCompare(b.department ?? "~") || a.name.localeCompare(b.name),
    tasks: (a, b) => b.activeTasks - a.activeTasks || b.upcomingTasks - a.upcomingTasks || a.name.localeCompare(b.name),
    joined: (a, b) => (b.joinedOn ?? b.createdAt.toISOString()).localeCompare(a.joinedOn ?? a.createdAt.toISOString()),
  };
  shown = [...shown].sort(by[sort] ?? by.name);
  const pageRows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const roles = await roleList();
  const distinct = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => !!v))].sort().map((v) => ({ value: v, label: v }));
  const canInvite = user.permissions.has("staff.invite") || user.permissions.has("users.manage");
  const canRates = user.permissions.has("expenses.view");
  const manage = user.permissions.has("staff.manage");

  // Accounts that can be linked in the wizard: active staff-side logins with no team member, never client logins
  const candidates =
    manage && canInvite
      ? await many<{ id: string; email: string; fullName: string }>(adminDb.from(tbl(schema.profiles)).select("id,email,fullName:full_name").is("staff_id", null).eq("active", true).order("full_name").limit(500))
      : [];
  const clientLogins = candidates.length ? new Set((await many<{ id: string }>(adminDb.from(tbl(schema.customers)).select("id:auth_user_id").not("auth_user_id", "is", null).limit(5000))).map((c) => c.id)) : new Set<string>();

  const pending = current.filter((p) => p.account === "PENDING" || p.account === "EXPIRED").length;
  const params = Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>;

  return (
    <>
      <PageHeader
        title="Staff"
        description="Your team: who works for you, who can sign in and with which role, who is free and what everyone is working on."
        actions={
          manage && (
            <AddTeamMemberButton
              canInvite={canInvite}
              canRates={canRates}
              roles={assignableRoles(roles, user).map((r) => ({ key: r.key, name: r.name, description: r.description }))}
              accounts={candidates.filter((c) => !clientLogins.has(c.id)).map((c) => ({ id: c.id, label: `${c.fullName || c.email} · ${c.email}`, email: c.email }))}
              departments={distinct(current.map((p) => p.department)).map((o) => o.value)}
            />
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total team members" value={current.length} icon={UsersRound} href="/admin/staff" />
        <Kpi label="Active staff" value={current.filter((p) => p.employment === "ACTIVE").length} icon={UserCheck} href="/admin/staff?emp=active" />
        <Kpi label="Available today" value={current.filter((p) => p.availability === "AVAILABLE").length} icon={UserRoundCheck} href="/admin/staff?avail=AVAILABLE" />
        <Kpi label="Currently assigned" value={current.filter((p) => p.availability === "ASSIGNED").length} icon={CalendarCheck2} hint="On an event today" href="/admin/staff?avail=ASSIGNED" />
        <Kpi label="Pending invitations" value={pending} icon={MailQuestion} href="/admin/staff?account=PENDING" />
        <Kpi label="Archived staff" value={everyone.length - current.length} icon={Archive} href="/admin/staff?emp=archived" />
      </div>

      {user.permissions.has("events.update") && <ReviewQueue />}

      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Name, email, phone or code" className="sm:w-72" />
          <FilterSelect param="dept" label="Department" options={distinct(everyone.map((p) => p.department))} />
          <FilterSelect param="title" label="Job title" options={distinct(everyone.map((p) => p.role))} />
          <FilterSelect param="role" label="Role" options={[...roles.map((r) => ({ value: r.key, label: r.name })), { value: "none", label: "No login" }]} />
          <FilterSelect param="account" label="Account" options={(["ACTIVE", "PENDING", "INVITE_FAILED", "SUSPENDED", "NONE"] as AccountStatus[]).map((k) => ({ value: k, label: ACCOUNT_STATUS[k].label }))} />
          <FilterSelect param="avail" label="Today" options={(Object.keys(AVAILABILITY) as Availability[]).map((k) => ({ value: k, label: AVAILABILITY[k].label }))} />
          <FilterSelect
            param="emp"
            label="Employment"
            allLabel="Current"
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "archived", label: "Archived" },
              { value: "all", label: "Everyone" },
            ]}
          />
          <FilterSelect param="sort" label="Sort" allLabel="Name" options={Object.entries(SORTS).filter(([k]) => k !== "name").map(([value, label]) => ({ value, label }))} />
        </Toolbar>
        {shown.length === 0 ? (
          <EmptyState icon={UsersRound} title={everyone.length ? "No one matches these filters" : "No team members yet"}>
            {everyone.length ? "Try clearing a filter or the search." : "Add the people you assign to events. Give them a login so they see their own work."}
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Job title</Th>
                  <Th>Department</Th>
                  <Th>Skills</Th>
                  <Th>Account</Th>
                  <Th>Availability</Th>
                  <Th>Current event</Th>
                  <Th className="text-right">Active tasks</Th>
                  <Th className="text-right">Upcoming</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => (
                  <tr key={p.id} className={cn("hover:bg-a-subtle/60", p.employment !== "ACTIVE" && "text-a-muted")}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        {p.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- small public avatar
                          <img src={p.photoUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                        ) : (
                          <Avatar name={p.name} />
                        )}
                        <div className="min-w-0">
                          <Link href={`/admin/staff/${p.id}`} className="font-medium text-a-text hover:underline">
                            {p.name}
                          </Link>
                          <p className="truncate text-xs text-a-muted">{[p.employeeCode, p.phone, p.email ?? p.login?.email].filter(Boolean).join(" · ") || "No contact details"}</p>
                          {p.employment !== "ACTIVE" && <Badge tone={p.employment === "ARCHIVED" ? "neutral" : "warning"}>{p.employment === "ARCHIVED" ? "Archived" : "Inactive"}</Badge>}
                        </div>
                      </div>
                    </Td>
                    <Td className="text-[13px]">
                      {p.role ?? "—"}
                      {p.employmentType && <span className="block text-xs text-a-muted">{EMPLOYMENT_TYPES[p.employmentType]}</span>}
                      {canRates && p.dailyRate > 0 && <span className="block text-xs text-a-muted">{npr(p.dailyRate)}/day</span>}
                    </Td>
                    <Td className="text-[13px]">{p.department ?? "—"}</Td>
                    <Td className="max-w-48">
                      <div className="flex flex-wrap gap-1">
                        {p.skills.slice(0, 3).map((s) => (
                          <Badge key={s} icon={false}>
                            {s}
                          </Badge>
                        ))}
                        {p.skills.length > 3 && <span className="text-xs text-a-muted">+{p.skills.length - 3}</span>}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={ACCOUNT_STATUS[p.account].tone}>{ACCOUNT_STATUS[p.account].label}</Badge>
                      {p.roles.length > 0 && <span className="mt-0.5 block text-xs text-a-muted">{p.roles.map((r) => r.name).join(", ")}</span>}
                    </Td>
                    <Td>
                      <Badge tone={AVAILABILITY[p.availability].tone}>{AVAILABILITY[p.availability].label}</Badge>
                      {p.availabilityNote && <span className="mt-0.5 block max-w-36 truncate text-xs text-a-muted">{p.availabilityNote}</span>}
                    </Td>
                    <Td className="max-w-52 text-xs">
                      {p.currentEvent ? (
                        <>
                          <span className={cn("block truncate", p.currentEvent.today && "font-medium text-a-text")}>{p.currentEvent.title}</span>
                          <span className="text-a-muted">{p.currentEvent.today ? "Today" : `Next · ${fmtDate(p.currentEvent.eventDate)}`}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {p.activeTasks}
                      {p.overdueTasks > 0 && <span className="block text-xs font-medium text-a-danger">{p.overdueTasks} overdue</span>}
                    </Td>
                    <Td className="text-right tabular-nums">{p.upcomingTasks}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <Link href={`/admin/staff/${p.id}`} className="text-[13px] font-medium text-a-accent hover:underline">
                        Profile
                      </Link>
                      <span className="text-a-muted"> · </span>
                      <Link href={`/admin/staff/${p.id}?tab=tasks`} className="text-[13px] font-medium text-a-accent hover:underline">
                        Tasks
                      </Link>
                      {canInvite && p.employment !== "ARCHIVED" && (
                        <>
                          <span className="text-a-muted"> · </span>
                          <Link href={`/admin/staff/${p.id}?tab=login`} className="text-[13px] font-medium text-a-accent hover:underline">
                            {p.account === "NONE" || p.account === "INVITE_FAILED" ? "Invite" : "Login"}
                          </Link>
                        </>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination basePath="/admin/staff" params={params} page={page} pageSize={PAGE_SIZE} total={shown.length} />
          </>
        )}
      </Card>
    </>
  );
}

/** Work the team has submitted for a manager's approval (Phase 3 review). */
async function ReviewQueue() {
  const rows = await many<{ status: string; updatedAt: Date; proofMediaIds: string[]; completionNote: string | null; s: { name: string }; t: { id: string; title: string; status: string; dueAt: Date | null; e: { title: string; eventDate: string } | null } }>(
    adminDb
      .from(tbl(schema.eventTaskAssignees))
      .select("status,updatedAt:updated_at,proofMediaIds:proof_media_ids,completionNote:completion_note,s:staff!inner(name),t:event_tasks!inner(id,title,status,dueAt:due_at,e:events(title,eventDate:event_date))")
      .eq("status", "REVIEW")
      .is("removed_at", null)
      .order("updated_at")
      .limit(100),
  );
  if (!rows.length) return null;
  const tasks = [...new Map(rows.map((r) => [r.t.id, r.t])).values()];
  return (
    <Card title="Awaiting your review" description="Work the team has submitted for approval. Open a task to see their photos and notes." bodyClassName="p-0" className="mb-5">
      <ul className="divide-y divide-a-border">
        {tasks.map((t) => {
          const parts = rows.filter((r) => r.t.id === t.id);
          const photos = parts.reduce((n, p) => n + p.proofMediaIds.length, 0);
          return (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
              <Link href={`/admin/my-work/${t.id}`} className="min-w-0 hover:underline">
                <span className="font-medium">{t.title}</span>
                <span className="block text-xs text-a-muted">
                  {[t.e?.title, t.e && fmtDate(t.e.eventDate), `submitted by ${parts.map((p) => p.s.name).join(", ")}`, `${fmtDateTime(parts[0]!.updatedAt)}`, `${photos} photo${photos === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                </span>
                {parts.find((p) => p.completionNote) && <span className="block text-xs text-a-muted">“{parts.find((p) => p.completionNote)!.completionNote}”</span>}
              </Link>
              <ReviewButtons taskId={t.id} title={t.title} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
