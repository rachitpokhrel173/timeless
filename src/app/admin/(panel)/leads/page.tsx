import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Download, Kanban, Plus, UserPlus } from "lucide-react";
import { adminDb, cols, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { LEAD_STAGES } from "@/server/crm";
import { eventTypeName, eventTypeOptions, sourceOptions, stageOptions, userOptions } from "@/server/lookups";
import { BulkTable, FilterSelect, SearchBox } from "@/components/admin/interactive";
import { LEAD_STAGE, PRIORITY, StatusBadge, options } from "@/components/admin/status";
import { buttonClass, EmptyState, hrefWith, LinkButton, PageHeader, Pagination, Tabs, Toolbar, Card } from "@/components/admin/ui";
import ImportButton from "../ImportButton";
import { bulkArchiveLeads, bulkAssignLeads, bulkLeadStage } from "./actions";

export const metadata: Metadata = { title: "Leads" };

const SORTS = { created: ["created_at", false], event: ["event_date", true], followup: ["next_followup_at", true], name: ["name", true] } as const;

export default async function LeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  const user = await requirePage("leads.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 30);
  const canUpdate = user.permissions.has("leads.update");
  const [types, users, sources, stages] = await Promise.all([eventTypeOptions(), userOptions(), sourceOptions(), stageOptions()]);
  const userName = (id: string | null) => users.find((u) => u.value === id)?.label ?? null;
  const archived = !!str("archived");

  let query = adminDb.from(tbl(schema.leads)).select(cols(schema.leads), { count: "exact" }).is("deleted_at", null);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (q) {
    const term = pgrstValue(likeTerm(q));
    query = query.or(["name", "phone", "email", "number"].map((c) => `${c}.ilike.${term}`).join(","));
  }
  if (str("stage") && LEAD_STAGES.includes(str("stage") as never)) query = query.eq("stage", str("stage")!);
  if (str("source")) query = query.eq("source_key", str("source")!);
  if (str("priority")) query = query.eq("priority", str("priority")!);
  if (str("assigned") === "me") query = query.eq("assigned_to", user.id);
  else if (str("assigned") === "none") query = query.is("assigned_to", null);
  const [sortColumn, ascending] = SORTS[(str("sort") as keyof typeof SORTS) ?? "created"] ?? SORTS.created;
  const { rows, total } = await paged<Row<typeof schema.leads>>(
    query
      .order(sortColumn, { ascending })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1),
  );

  const bulk = canUpdate
    ? [
        { label: "Mark contacted", action: bulkLeadStage.bind(null, "CONTACTED"), success: "Leads updated" },
        { label: "Mark qualified", action: bulkLeadStage.bind(null, "QUALIFIED"), success: "Leads updated" },
        { label: "Mark lost", action: bulkLeadStage.bind(null, "LOST"), confirm: "Mark the selected leads as lost?", success: "Leads updated" },
        { label: "Assign to me", action: bulkAssignLeads.bind(null, user.id), success: "Leads assigned" },
        { label: "Archive", icon: <Archive />, action: bulkArchiveLeads, confirm: "Archived leads leave the pipeline but keep their history. Archive the selected leads?", success: "Leads archived" },
      ]
    : [];
  const sortLink = (key: keyof typeof SORTS, label: string) => (
    <Link href={hrefWith("/admin/leads", sp, { sort: key, page: null })} className={str("sort") === key || (!str("sort") && key === "created") ? "text-a-text underline" : "hover:text-a-text"}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Leads"
        description="Everyone who has shown interest — from first contact to confirmed booking."
        actions={
          <>
            <LinkButton href="/admin/pipeline" icon={Kanban}>
              Pipeline board
            </LinkButton>
            <a href="/api/admin/export/leads" className={buttonClass("secondary")}>
              <Download className="size-4" aria-hidden /> Export CSV
            </a>
            {user.permissions.has("leads.create") && <ImportButton entity="leads" />}
            {user.permissions.has("leads.create") && (
              <LinkButton href="/admin/leads/new" variant="primary" icon={Plus}>
                New lead
              </LinkButton>
            )}
          </>
        }
      />
      <Tabs
        active={archived ? "archived" : "active"}
        items={[
          { key: "active", label: "Active", href: "/admin/leads" },
          { key: "archived", label: "Archived", href: "/admin/leads?archived=1" },
        ]}
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Name, phone, email or LD number" />
          <FilterSelect param="stage" label="Stage" options={stages} />
          <FilterSelect param="source" label="Source" options={sources} />
          <FilterSelect param="priority" label="Priority" options={options(schema.priority.enumValues, PRIORITY)} />
          <FilterSelect param="assigned" label="Assigned" options={[{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }]} />
          <span className="text-xs text-a-muted sm:ml-auto">
            Sort: {sortLink("created", "Newest")} · {sortLink("event", "Event date")} · {sortLink("followup", "Next follow-up")} · {sortLink("name", "Name")}
          </span>
        </Toolbar>
        <BulkTable
          columns={[{ label: "Lead" }, { label: "Event" }, { label: "Source" }, { label: "Stage" }, { label: "Assigned" }, { label: "Next follow-up" }, { label: "Created" }]}
          actions={bulk}
          rows={rows.map((r) => ({
            id: r.id,
            cells: [
              <div key="n" className="min-w-0">
                <Link href={`/admin/leads/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
                <p className="text-xs text-a-muted">
                  {r.number} · {r.phone ?? r.email}
                </p>
              </div>,
              <div key="e">
                {eventTypeName(types, r.eventType)}
                <p className="text-xs text-a-muted">{r.eventDate ? fmtDate(r.eventDate) : "Date TBC"}</p>
              </div>,
              sources.find((s) => s.value === r.sourceKey)?.label ?? r.sourceKey,
              <div key="s" className="flex flex-wrap gap-1">
                <StatusBadge map={LEAD_STAGE} value={r.stage} />
                {(r.priority === "HIGH" || r.priority === "URGENT") && <StatusBadge map={PRIORITY} value={r.priority} />}
              </div>,
              userName(r.assignedTo) ?? <span className="text-a-muted">—</span>,
              r.nextFollowupAt ? <span className={r.nextFollowupAt < new Date() ? "font-medium text-a-danger" : undefined}>{fmtDate(r.nextFollowupAt)}</span> : <span className="text-a-muted">—</span>,
              fmtDate(r.createdAt),
            ],
          }))}
          empty={
            <EmptyState icon={UserPlus} title={q || Object.keys(sp).length ? "No leads match these filters" : "No leads yet"} action={user.permissions.has("leads.create") && !q ? <LinkButton href="/admin/leads/new" size="sm">Add a lead</LinkButton> : undefined}>
              {q ? "Try a different search." : "Website inquiries create leads automatically."}
            </EmptyState>
          }
        />
        <Pagination basePath="/admin/leads" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
