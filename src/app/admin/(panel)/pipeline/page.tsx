import type { Metadata } from "next";
import { List, Plus, UserPlus } from "lucide-react";
import { adminDb, all, cols, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { isoDaysFromNow, serverNow } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { eventTypeName, eventTypeOptions, sourceOptions, stageOptions, userOptions } from "@/server/lookups";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/admin/ui";
import PipelineBoard, { type BoardColumn } from "./PipelineBoard";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/admin/pipeline">) {
  const user = await requirePage("leads.view");
  const sp = await searchParams;
  const { q, str } = listParams(sp);
  const [types, users, stages, sources] = await Promise.all([eventTypeOptions(), userOptions(), stageOptions(), sourceOptions()]);
  const userName = (id: string | null) => users.find((u) => u.value === id)?.label ?? null;

  const matching = await all<Row<typeof schema.leads>>(() => {
    let query = adminDb
      .from(tbl(schema.leads))
      .select(cols(schema.leads))
      .is("deleted_at", null)
      .is("archived_at", null)
      // Closed stages only show the last 60 days so the board stays focused on active work
      .or(`stage.not.in.(COMPLETED,LOST),updated_at.gt.${isoDaysFromNow(-60)}`);
    if (q) {
      const term = pgrstValue(likeTerm(q));
      query = query.or(["name", "phone", "number"].map((c) => `${c}.ilike.${term}`).join(","));
    }
    if (str("assigned") === "me") query = query.eq("assigned_to", user.id);
    if (str("source")) query = query.eq("source_key", str("source")!);
    return query.order("position").order("created_at", { ascending: false }).order("id");
  });
  const rows = matching.slice(0, 800);
  const totals = [...new Set(matching.map((r) => r.stage))].map((stage) => ({ stage, c: matching.filter((r) => r.stage === stage).length }));
  const now = serverNow();
  const columns: BoardColumn[] = stages.map((s) => ({
    status: s.value as BoardColumn["status"],
    label: s.label,
    total: totals.find((t) => t.stage === s.value)?.c ?? 0,
    leads: rows
      .filter((r) => r.stage === s.value)
      .slice(0, 60)
      .map((r) => ({
        id: r.id,
        number: r.number,
        name: r.name,
        eventType: eventTypeName(types, r.eventType),
        eventDate: r.eventDate,
        budget: r.budget,
        source: sources.find((x) => x.value === r.sourceKey)?.label ?? r.sourceKey,
        priority: r.priority,
        assignee: userName(r.assignedTo),
        nextFollowUp: r.nextFollowupAt?.toISOString() ?? null,
        followUpOverdue: !!r.nextFollowupAt && r.nextFollowupAt.getTime() < now,
      })),
  }));

  return (
    <>
      <PageHeader
        title="Sales pipeline"
        description="Drag leads between stages — or use “Move to…” on a card. Every move is logged on the lead's timeline."
        actions={
          <>
            <LinkButton href="/admin/leads" icon={List}>
              List view
            </LinkButton>
            {user.permissions.has("leads.create") && (
              <LinkButton href="/admin/leads/new" variant="primary" icon={Plus}>
                New lead
              </LinkButton>
            )}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox placeholder="Search the board…" />
        <FilterSelect param="source" label="Source" options={sources} />
        <FilterSelect param="assigned" label="Assigned" options={[{ value: "me", label: "Me" }]} />
        <span className="text-xs text-a-muted">Completed and lost show the last 60 days.</span>
      </div>
      {rows.length === 0 && !q ? (
        <Card>
          <EmptyState icon={UserPlus} title="No leads yet" action={user.permissions.has("leads.create") ? <LinkButton href="/admin/leads/new" variant="primary">Add a lead</LinkButton> : undefined}>
            Website inquiries appear here automatically.
          </EmptyState>
        </Card>
      ) : (
        <PipelineBoard initial={columns} />
      )}
    </>
  );
}
