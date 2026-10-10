import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, PartyPopper, Plus } from "lucide-react";
import { adminDb, all, cols, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDay, num, todayISO } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { eventTypeName, eventTypeOptions } from "@/server/lookups";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { EVENT_STATUS, options, StatusBadge } from "@/components/admin/status";
import { Card, EmptyState, LinkButton, PageHeader, Pagination, Table, Tabs, Td, Th, Toolbar } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Events" };

const STATUSES = ["PLANNING", "READY", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export default async function EventsPage({ searchParams }: PageProps<"/admin/events">) {
  const user = await requirePage("events.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 30);
  const when = str("when") === "past" ? "past" : str("when") === "all" ? "all" : "upcoming";
  const status = str("status");
  const today = todayISO();

  let query = adminDb.from(tbl(schema.events)).select(`${cols(schema.events)},customer:customers(id,name)`, { count: "exact" }).is("archived_at", null);
  if (when === "upcoming") query = query.gte("event_date", today);
  if (when === "past") query = query.lt("event_date", today);
  if (status && (STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  else if (when === "upcoming") query = query.neq("status", "CANCELLED");
  if (q) {
    const term = pgrstValue(likeTerm(q));
    query = query.or(`title.ilike.${term},venue.ilike.${term}`);
  }
  const [{ rows, total }, types] = await Promise.all([
    paged<Row<typeof schema.events> & { customer: { id: string; name: string } | null }>(query.order("event_date", { ascending: when === "upcoming" }).order("start_at").range(offset, offset + pageSize - 1)),
    eventTypeOptions(),
  ]);
  const ids = rows.map((r) => r.id);
  const [tasks, team] = ids.length
    ? await Promise.all([
        all<{ eventId: string; status: string }>(() => adminDb.from(tbl(schema.eventTasks)).select("eventId:event_id,status").in("event_id", ids).order("id")),
        all<{ eventId: string }>(() => adminDb.from(tbl(schema.staffAssignments)).select("eventId:event_id").in("event_id", ids).order("id")),
      ])
    : [[], []];

  return (
    <>
      <PageHeader
        title="Events"
        description="Every booked event and its planning progress."
        actions={
          <>
            <LinkButton href="/admin/calendar" icon={CalendarDays}>
              Calendar
            </LinkButton>
            {user.permissions.has("bookings.create") && (
              <LinkButton href="/admin/bookings/new" variant="primary" icon={Plus}>
                New booking
              </LinkButton>
            )}
          </>
        }
      />
      <Tabs
        active={when}
        items={[
          { key: "upcoming", label: "Upcoming", href: "/admin/events" },
          { key: "past", label: "Past", href: "/admin/events?when=past" },
          { key: "all", label: "All", href: "/admin/events?when=all" },
        ]}
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Title or venue" />
          <FilterSelect param="status" label="Status" options={options(STATUSES, EVENT_STATUS)} />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={PartyPopper} title={q || status ? "No events match" : when === "upcoming" ? "No upcoming events" : "No events"}>
            Events are created with each booking.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Event</Th>
                <Th>Client</Th>
                <Th>Venue</Th>
                <Th>Tasks</Th>
                <Th>Team</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const mine = tasks.filter((t) => t.eventId === e.id);
                const done = mine.filter((t) => t.status === "COMPLETED").length;
                const people = team.filter((t) => t.eventId === e.id).length;
                const soon = e.eventDate >= today && e.eventDate <= todayISO(7);
                return (
                  <tr key={e.id} className="hover:bg-a-subtle/60">
                    <Td className={`whitespace-nowrap ${soon ? "font-semibold text-a-gold" : ""}`}>
                      {fmtDay(e.eventDate)}
                      <span className="block text-xs font-normal text-a-muted">{e.eventDate.slice(0, 4)}</span>
                    </Td>
                    <Td>
                      <Link href={`/admin/events/${e.id}`} className="font-medium hover:underline">
                        {e.title}
                      </Link>
                      <span className="block text-xs text-a-muted">
                        {eventTypeName(types, e.eventType)}
                        {e.guestCount ? ` · ${num(e.guestCount)} guests` : ""}
                      </span>
                    </Td>
                    <Td>{e.customer ? <Link href={`/admin/customers/${e.customer.id}`} className="hover:underline">{e.customer.name}</Link> : "—"}</Td>
                    <Td className="max-w-48 truncate">{e.venue ?? "—"}</Td>
                    <Td className="text-xs tabular-nums">{mine.length ? `${done}/${mine.length}` : "—"}</Td>
                    <Td className={`text-xs ${people === 0 && e.status !== "CANCELLED" && e.eventDate >= today ? "font-medium text-a-warning" : ""}`}>{people || "None"}</Td>
                    <Td>
                      <StatusBadge map={EVENT_STATUS} value={e.status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/events" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
