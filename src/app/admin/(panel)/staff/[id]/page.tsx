import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr, num, todayISO } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { ContactButtons } from "@/components/admin/contact-links";
import { ArchivedBadge, EVENT_STATUS, StatusBadge, TASK_STATUS, label } from "@/components/admin/status";
import { Badge, Card, DetailList, EmptyState, PageHeader } from "@/components/admin/ui";
import { ArchiveStaffButton, AvailabilityButton, ClearAvailabilityButton, StaffButton } from "../StaffClient";

export const metadata: Metadata = { title: "Team member" };

export default async function StaffMemberPage({ params }: PageProps<"/admin/staff/[id]">) {
  const user = await requirePage("staff.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const person = await maybe<Row<typeof schema.staff>>(adminDb.from(tbl(schema.staff)).select(cols(schema.staff)).eq("id", id));
  if (!person) notFound();
  const manage = user.permissions.has("staff.manage");
  const today = todayISO();
  const [assignments, availability, tasks, login] = await Promise.all([
    many<{ id: string; role: string | null; days: number; e: { id: string; title: string; eventDate: string; status: string; venue: string | null } }>(
      adminDb.from(tbl(schema.staffAssignments)).select("id,role,days,e:events!inner(id,title,eventDate:event_date,status,venue)").eq("staff_id", id).order("e(event_date)", { ascending: false }).limit(60),
    ),
    many<Row<typeof schema.staffAvailability>>(adminDb.from(tbl(schema.staffAvailability)).select(cols(schema.staffAvailability)).eq("staff_id", id).gte("date", todayISO(-7)).order("date").limit(60)),
    many<{ id: string; title: string; status: string; dueAt: Date | null; eventId: string | null }>(
      adminDb.from(tbl(schema.eventTasks)).select("id,title,status,dueAt:due_at,eventId:event_id").eq("assignee_staff_id", id).neq("status", "COMPLETED").order("due_at", { nullsFirst: false }).limit(20),
    ),
    maybe<{ id: string; fullName: string; email: string }>(adminDb.from(tbl(schema.profiles)).select("id,fullName:full_name,email").eq("staff_id", id)),
  ]);
  const upcoming = assignments.filter((a) => a.e.eventDate >= today && a.e.status !== "CANCELLED").reverse();
  const past = assignments.filter((a) => a.e.eventDate < today);
  const yearDays = assignments.filter((a) => a.e.eventDate >= todayISO(-365) && a.e.eventDate < today && a.e.status !== "CANCELLED").reduce((s, a) => s + Number(a.days), 0);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/staff", label: "Staff" }}
        eyebrow={person.role ?? "Team"}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {person.name}
            {person.archivedAt && <ArchivedBadge />}
            {!person.active && !person.archivedAt && <Badge>Inactive</Badge>}
          </span>
        }
        actions={
          <>
            <ContactButtons phone={person.phone} email={person.email} />
            {manage && <ArchiveStaffButton id={id} archived={!!person.archivedAt} />}
            {manage && <StaffButton values={person} />}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ["Upcoming events", String(upcoming.length)],
          ["Event days (12 months)", num(yearDays)],
          ["Open tasks", String(tasks.length)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-a-border bg-a-surface p-4">
            <p className="text-[13px] text-a-muted">{l}</p>
            <p className="mt-1 font-serif text-2xl font-medium tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="Upcoming events" bodyClassName="p-0">
            {upcoming.length === 0 ? (
              <EmptyState compact title="Not assigned to any upcoming event" />
            ) : (
              <EventList rows={upcoming} />
            )}
          </Card>
          {tasks.length > 0 && (
            <Card title="Open tasks" bodyClassName="p-0">
              <ul className="divide-y divide-a-border">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <Link href={t.eventId ? `/admin/events/${t.eventId}?tab=tasks` : "/admin/tasks"} className="hover:underline">
                      {t.title}
                      {t.dueAt && <span className="block text-xs text-a-muted">due {fmtDateTime(t.dueAt)}</span>}
                    </Link>
                    <StatusBadge map={TASK_STATUS} value={t.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {past.length > 0 && (
            <Card title="Past events" bodyClassName="p-0">
              <EventList rows={past.slice(0, 20)} />
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Details">
            <DetailList
              columns={1}
              items={[
                ["Phone", person.phone],
                ["Email", person.email],
                ["Skills", person.skills.length ? person.skills.join(", ") : null],
                ["Daily rate", user.permissions.has("expenses.view") ? npr(person.dailyRate) : null],
                ["Admin login", login ? `${login.fullName || login.email}` : "None — link one under Users & Roles"],
                ["Notes", person.notes],
              ]}
            />
          </Card>
          <Card title="Availability" description="Leave and unavailable days block planning." actions={manage && <AvailabilityButton staffId={id} />}>
            {availability.length === 0 ? (
              <p className="text-[13px] text-a-muted">Available every day.</p>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {availability.map((a) => (
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
      </div>
    </>
  );
}

function EventList({ rows }: { rows: { id: string; role: string | null; days: number; e: { id: string; title: string; eventDate: string; status: string; venue: string | null } }[] }) {
  return (
    <ul className="divide-y divide-a-border">
      {rows.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <Link href={`/admin/events/${a.e.id}?tab=team`} className="hover:underline">
            <span className="font-medium">{a.e.title}</span>
            <span className="block text-xs text-a-muted">
              {fmtDate(a.e.eventDate)}
              {a.e.venue ? ` · ${a.e.venue}` : ""}
              {a.role ? ` · ${a.role}` : ""} · {num(a.days)} day{Number(a.days) === 1 ? "" : "s"}
            </span>
          </Link>
          <StatusBadge map={EVENT_STATUS} value={a.e.status} />
        </li>
      ))}
    </ul>
  );
}
