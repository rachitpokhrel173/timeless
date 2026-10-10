import type { Metadata } from "next";
import Link from "next/link";
import { UsersRound } from "lucide-react";
import { adminDb, all, cols, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr, todayISO } from "@/lib/format";
import { listParams } from "@/lib/list";
import { SearchBox } from "@/components/admin/interactive";
import { Badge, Card, EmptyState, PageHeader, Table, Tabs, Td, Th, Toolbar } from "@/components/admin/ui";
import { StaffButton } from "./StaffClient";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: PageProps<"/admin/staff">) {
  const user = await requirePage("staff.view");
  const { q, str } = listParams(await searchParams);
  const archived = !!str("archived");
  const today = todayISO();
  const [people, upcoming, off] = await Promise.all([
    all<Row<typeof schema.staff>>(() => {
      const query = adminDb.from(tbl(schema.staff)).select(cols(schema.staff));
      return (archived ? query.not("archived_at", "is", null) : query.is("archived_at", null)).order("name").order("id");
    }),
    all<{ staffId: string; e: { title: string; eventDate: string } }>(() =>
      adminDb.from(tbl(schema.staffAssignments)).select("staffId:staff_id,e:events!inner(title,eventDate:event_date)").gte("e.event_date", today).neq("e.status", "CANCELLED").order("id"),
    ),
    all<{ staffId: string; status: string; date: string }>(() => adminDb.from(tbl(schema.staffAvailability)).select("staffId:staff_id,status,date").eq("date", today).order("id")),
  ]);
  const shown = q ? people.filter((p) => `${p.name} ${p.role ?? ""} ${p.skills.join(" ")}`.toLowerCase().includes(q.toLowerCase())) : people;

  return (
    <>
      <PageHeader title="Staff" description="Your decorators, crew and coordinators — who's working which event." actions={user.permissions.has("staff.manage") && !archived && <StaffButton />} />
      <Tabs
        active={archived ? "archived" : "active"}
        items={[
          { key: "active", label: "Team", href: "/admin/staff" },
          { key: "archived", label: "Archived", href: "/admin/staff?archived=1" },
        ]}
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Name, role or skill" />
        </Toolbar>
        {shown.length === 0 ? (
          <EmptyState icon={UsersRound} title={people.length ? "No one matches" : "No team members yet"}>
            Add the people you assign to events — they don't need an admin login.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Skills</Th>
                <Th>Today</Th>
                <Th>Next event</Th>
                <Th className="text-right">Upcoming</Th>
                {user.permissions.has("expenses.view") && <Th className="text-right">Daily rate</Th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const mine = upcoming.filter((u) => u.staffId === p.id).sort((a, b) => a.e.eventDate.localeCompare(b.e.eventDate));
                const away = off.find((o) => o.staffId === p.id && o.status !== "AVAILABLE");
                const working = mine.find((m) => m.e.eventDate === today);
                return (
                  <tr key={p.id} className="hover:bg-a-subtle/60">
                    <Td>
                      <Link href={`/admin/staff/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <span className="block text-xs text-a-muted">
                        {p.role ?? "Team"}
                        {p.phone ? ` · ${p.phone}` : ""}
                      </span>
                    </Td>
                    <Td className="max-w-56">
                      <div className="flex flex-wrap gap-1">
                        {p.skills.slice(0, 3).map((s) => (
                          <Badge key={s} icon={false}>
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </Td>
                    <Td>{away ? <Badge tone="warning">{away.status === "LEAVE" ? "On leave" : "Unavailable"}</Badge> : working ? <Badge tone="gold">At an event</Badge> : !p.active ? <Badge>Inactive</Badge> : <Badge tone="success">Available</Badge>}</Td>
                    <Td className="text-xs">
                      {mine[0] ? (
                        <>
                          {mine[0].e.title}
                          <span className="block text-a-muted">{fmtDate(mine[0].e.eventDate)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{mine.length}</Td>
                    {user.permissions.has("expenses.view") && <Td className="text-right tabular-nums">{npr(p.dailyRate)}</Td>}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
