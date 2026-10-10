import type { Metadata } from "next";
import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { adminDb, cols, paged, schema, tbl, total as countRows, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDateTime, todayISO } from "@/lib/format";
import { listParams } from "@/lib/list";
import { userOptions } from "@/server/lookups";
import { FilterSelect } from "@/components/admin/interactive";
import { FOLLOWUP_STATUS, PRIORITY, StatusBadge } from "@/components/admin/status";
import { Card, EmptyState, PageHeader, Pagination, Table, Tabs, Td, Th, Toolbar } from "@/components/admin/ui";
import { CompleteFollowupButton } from "../leads/LeadClient";

export const metadata: Metadata = { title: "Follow-ups" };

type Query = ReturnType<ReturnType<typeof adminDb.from>["select"]>;
/** Start of a Nepal calendar day as a timestamp. */
const dayStart = (iso: string) => new Date(`${iso}T00:00:00+05:45`).toISOString();

export default async function FollowUpsPage({ searchParams }: PageProps<"/admin/follow-ups">) {
  const user = await requirePage("leads.view");
  const sp = await searchParams;
  const { page, pageSize, offset, str } = listParams(sp, 40);
  const tab = str("tab") ?? "today";
  const today = todayISO();
  const start = dayStart(today);
  const end = dayStart(todayISO(1));
  const open = (q: Query) => q.in("status", ["PENDING", "OVERDUE"]);
  const TABS: Record<string, (q: Query) => Query> = {
    overdue: (q) => open(q).lt("due_at", start),
    today: (q) => open(q).gte("due_at", start).lt("due_at", end),
    upcoming: (q) => open(q).gte("due_at", end),
    completed: (q) => q.eq("status", "COMPLETED"),
  };
  const mine = (q: Query) => (str("assigned") === "me" ? q.eq("assigned_to", user.id) : str("assigned") === "none" ? q.is("assigned_to", null) : q);
  const where = (q: Query) => mine((TABS[tab] ?? TABS.today)(q));
  const [{ rows: found, total }, counts, users] = await Promise.all([
    paged<Row<typeof schema.followups> & { lead: { id: string; name: string; number: string } | null; customer: { id: string; name: string } | null }>(
      where(adminDb.from(tbl(schema.followups)).select(`${cols(schema.followups)},lead:leads(id,name,number),customer:customers(id,name)`, { count: "exact" }))
        .order(tab === "completed" ? "completed_at" : "due_at", { ascending: tab !== "completed" })
        .range(offset, offset + pageSize - 1),
    ),
    Promise.all(Object.entries(TABS).map(async ([k, cond]) => [k, await countRows(mine(cond(adminDb.from(tbl(schema.followups)).select("id", { count: "exact", head: true }))))] as const)),
    userOptions(),
  ]);
  const rows = found.map(({ lead, customer, ...f }) => ({ f, lead, customer }));
  const countOf = Object.fromEntries(counts);
  const name = (id: string | null) => users.find((u) => u.value === id)?.label;
  const canUpdate = user.permissions.has("leads.update");

  return (
    <>
      <PageHeader title="Follow-ups" description="Calls, messages and meetings to keep every lead moving. Schedule new ones from a lead, inquiry or customer." />
      <Tabs
        active={tab}
        items={[
          { key: "overdue", label: "Overdue", href: "/admin/follow-ups?tab=overdue", count: countOf.overdue },
          { key: "today", label: "Today", href: "/admin/follow-ups?tab=today", count: countOf.today },
          { key: "upcoming", label: "Upcoming", href: "/admin/follow-ups?tab=upcoming", count: countOf.upcoming },
          { key: "completed", label: "Completed", href: "/admin/follow-ups?tab=completed" },
        ]}
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <FilterSelect param="assigned" label="Assigned" allLabel="Anyone" options={[{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }]} />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={PhoneCall} title={tab === "overdue" ? "Nothing overdue" : tab === "today" ? "No follow-ups today" : "Nothing here"}>
            {tab === "today" ? "Open a lead to schedule a call, WhatsApp, email or meeting." : undefined}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Who</Th>
                <Th>Type</Th>
                <Th>Due</Th>
                <Th>Priority</Th>
                <Th>Assigned</Th>
                <Th>Note</Th>
                <Th className="sr-only">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ f: x, lead, customer }) => (
                <tr key={x.id} className="hover:bg-a-subtle/60">
                  <Td>
                    {lead?.id ? (
                      <Link href={`/admin/leads/${lead.id}`} className="font-medium hover:underline">
                        {lead.name}
                      </Link>
                    ) : customer?.id ? (
                      <Link href={`/admin/customers/${customer.id}`} className="font-medium hover:underline">
                        {customer.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {lead?.number && <span className="block text-xs text-a-muted">{lead.number}</span>}
                  </Td>
                  <Td>{x.type.charAt(0) + x.type.slice(1).toLowerCase()}</Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {fmtDateTime(x.dueAt)}
                      {x.status !== "COMPLETED" && x.dueAt < new Date() && <StatusBadge map={FOLLOWUP_STATUS} value="OVERDUE" />}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge map={PRIORITY} value={x.priority} />
                  </Td>
                  <Td>{name(x.assignedTo) ?? <span className="text-a-muted">—</span>}</Td>
                  <Td className="max-w-xs">
                    <span className="line-clamp-2 text-xs text-a-muted">{x.status === "COMPLETED" ? (x.outcome ?? x.note) : x.note}</span>
                  </Td>
                  <Td className="text-right">{canUpdate && x.status !== "COMPLETED" && <CompleteFollowupButton id={x.id} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/follow-ups" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
