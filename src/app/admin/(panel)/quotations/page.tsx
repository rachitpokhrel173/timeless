import type { Metadata } from "next";
import Link from "next/link";
import { FileText, LayoutTemplate, Plus } from "lucide-react";
import { adminDb, all, cols, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr, todayISO } from "@/lib/format";
import { first, likeTerm, listParams } from "@/lib/list";
import { quoteAcceptance } from "@/server/sales";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { options, QUOTE_STATUS, StatusBadge } from "@/components/admin/status";
import { Card, EmptyState, Kpi, LinkButton, PageHeader, Pagination, Table, Tabs, Td, Th, Toolbar } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Quotations" };

const STATUSES = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED"] as const;

type Bk = { id: string; number: string; amountPaid: number };

export default async function QuotationsPage({ searchParams }: PageProps<"/admin/quotations">) {
  const user = await requirePage("quotations.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 30);
  const archived = !!str("archived");
  const status = str("status");

  let query = adminDb
    .from(tbl(schema.quotations))
    .select(`${cols(schema.quotations)},customer:customers!inner(id,name),booking:bookings(id,number,amountPaid:amount_paid)`, { count: "exact" })
    .is("deleted_at", null);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (status === "open") query = query.in("status", ["DRAFT", "SENT", "VIEWED"]);
  else if (status && (STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (q) {
    const term = pgrstValue(likeTerm(q));
    query = query.or(`number.ilike.${term},title.ilike.${term},venue.ilike.${term}`);
  }
  const { rows, total } = await paged<Row<typeof schema.quotations> & { customer: { id: string; name: string }; booking: Bk | Bk[] | null }>(
    query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1),
  );

  // Summary across all live quotations
  const summary = await all<{ status: string; total: number }>(() => adminDb.from(tbl(schema.quotations)).select("status,total").is("deleted_at", null).is("archived_at", null).order("id"));
  const open = summary.filter((s) => ["SENT", "VIEWED"].includes(s.status));
  const accepted = summary.filter((s) => s.status === "ACCEPTED");
  const decided = summary.filter((s) => ["ACCEPTED", "REJECTED", "EXPIRED"].includes(s.status)).length;
  const today = todayISO();

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Price proposals sent to clients. Accepted quotes become bookings."
        actions={
          <>
            <LinkButton href="/admin/quotations/templates" icon={LayoutTemplate}>
              Templates
            </LinkButton>
            {user.permissions.has("quotations.create") && (
              <LinkButton href="/admin/quotations/new" variant="primary" icon={Plus}>
                New quotation
              </LinkButton>
            )}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Drafts" value={summary.filter((s) => s.status === "DRAFT").length} href="/admin/quotations?status=DRAFT" />
        <Kpi label="Awaiting reply" value={open.length} hint={npr(open.reduce((n, s) => n + s.total, 0))} href="/admin/quotations?status=open" />
        <Kpi label="Accepted" value={accepted.length} hint={npr(accepted.reduce((n, s) => n + s.total, 0))} href="/admin/quotations?status=ACCEPTED" />
        <Kpi label="Win rate" value={decided ? `${Math.round((accepted.length / decided) * 100)}%` : "—"} hint="of decided quotes" />
      </div>
      <Tabs
        active={archived ? "archived" : "active"}
        items={[
          { key: "active", label: "Active", href: "/admin/quotations" },
          { key: "archived", label: "Archived", href: "/admin/quotations?archived=1" },
        ]}
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Number, title or venue" />
          <FilterSelect param="status" label="Status" options={[{ value: "open", label: "Open (draft/sent/viewed)" }, ...options(STATUSES, QUOTE_STATUS)]} />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={q || status ? "No quotations match" : "No quotations yet"}
            action={!q && !status && user.permissions.has("quotations.create") ? <LinkButton href="/admin/quotations/new" size="sm">Create a quotation</LinkButton> : undefined}
          >
            {q || status ? "Try a different search or filter." : "Create one from an inquiry or lead, or start from scratch."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Quotation</Th>
                <Th>Customer</Th>
                <Th>Event</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Advance</Th>
                <Th>Status</Th>
                <Th>Valid until</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const booking = first(r.booking);
                const accepted = r.status === "ACCEPTED" ? quoteAcceptance(r) : null;
                const lapsed = r.validUntil && r.validUntil < today && ["SENT", "VIEWED"].includes(r.status);
                return (
                  <tr key={r.id} className="hover:bg-a-subtle/60">
                    <Td>
                      <Link href={`/admin/quotations/${r.id}`} className="font-medium hover:underline">
                        {r.number}
                      </Link>
                      <span className="block max-w-64 truncate text-xs text-a-muted">{r.title}</span>
                    </Td>
                    <Td>
                      <Link href={`/admin/customers/${r.customer.id}`} className="hover:underline">
                        {r.customer.name}
                      </Link>
                    </Td>
                    <Td className="text-xs">
                      {fmtDate(r.eventDate)}
                      <span className="block text-a-muted">{r.venue ?? "—"}</span>
                    </Td>
                    <Td className="text-right font-medium tabular-nums">{npr(r.total)}</Td>
                    <Td className="text-right text-xs tabular-nums">
                      {booking && booking.amountPaid > 0 ? (
                        <span className={booking.amountPaid >= r.depositAmount ? "font-medium text-a-success" : "font-medium"}>{npr(booking.amountPaid)} paid</span>
                      ) : (
                        <span className="text-a-muted">{r.depositAmount ? `${npr(r.depositAmount)} due` : "—"}</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge map={QUOTE_STATUS} value={r.status} />
                        {r.version > 1 && <span className="text-xs text-a-muted">v{r.version}</span>}
                        {booking && (
                          <Link href={`/admin/bookings/${booking.id}`} className="text-xs text-a-accent hover:underline">
                            {booking.number}
                          </Link>
                        )}
                      </div>
                      {accepted?.name && (
                        <span className={`mt-1 block text-xs ${accepted.online ? "text-a-success" : "text-a-muted"}`}>{accepted.online ? `Accepted online by ${accepted.name}` : accepted.name}</span>
                      )}
                    </Td>
                    <Td className={lapsed ? "font-medium text-a-danger" : undefined}>{fmtDate(r.validUntil)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/quotations" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
