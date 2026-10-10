import type { Metadata } from "next";
import { ScrollText, ShieldAlert } from "lucide-react";
import { adminDb, all, cols, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { DateRangeFilter, FilterSelect, SearchBox } from "@/components/admin/interactive";
import { Badge, Card, EmptyState, Kpi, PageHeader, Pagination, Table, Tabs, Td, Th, Toolbar } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Activity logs" };

const tsFrom = (d: string) => new Date(`${d}T00:00:00+05:45`).toISOString();
const tsTo = (d: string) => new Date(new Date(`${d}T00:00:00+05:45`).getTime() + 86_400_000).toISOString();

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requirePage("audit.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 50);
  const tab = str("tab") === "security" ? "security" : "activity";

  return (
    <>
      <PageHeader title="Activity logs" description="Who did what, and when — every important change and every sign-in attempt." />
      <Tabs
        active={tab}
        items={[
          { key: "activity", label: "Activity", href: "/admin/activity" },
          { key: "security", label: "Sign-in attempts", href: "/admin/activity?tab=security" },
        ]}
      />
      {tab === "activity" ? <Activity sp={sp} page={page} pageSize={pageSize} offset={offset} q={q} str={str} /> : <Security sp={sp} page={page} pageSize={pageSize} offset={offset} q={q} />}
    </>
  );
}

type P = { sp: Record<string, string | string[] | undefined>; page: number; pageSize: number; offset: number; q?: string };

async function Activity({ sp, page, pageSize, offset, q, str }: P & { str: (k: string) => string | undefined }) {
  let query = adminDb.from(tbl(schema.activityLogs)).select(cols(schema.activityLogs), { count: "exact" });
  if (str("entity")) query = query.eq("entity", str("entity")!);
  if (str("user")) query = query.eq("user_id", str("user")!);
  if (str("from")) query = query.gte("created_at", tsFrom(str("from")!));
  if (str("to")) query = query.lt("created_at", tsTo(str("to")!));
  if (q) {
    const term = pgrstValue(likeTerm(q));
    query = query.or(`summary.ilike.${term},user_name.ilike.${term},action.ilike.${term}`);
  }
  const [{ rows, total }, people, entities] = await Promise.all([
    paged<Row<typeof schema.activityLogs>>(query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1)),
    all<{ id: string; fullName: string; email: string }>(() => adminDb.from(tbl(schema.profiles)).select("id,fullName:full_name,email,user_roles!inner(user_id)").order("full_name").order("id")),
    all<{ entity: string }>(() => adminDb.from(tbl(schema.activityLogs)).select("entity").gte("created_at", new Date(Date.now() - 180 * 86_400_000).toISOString()).order("entity").order("id")),
  ]);
  const users = [...new Map(people.map((p) => [p.id, { value: p.id, label: p.fullName || p.email }])).values()];
  const entityOptions = [...new Set(entities.map((e) => e.entity))].map((e) => ({ value: e, label: e.replace(/_/g, " ") }));

  return (
    <Card bodyClassName="p-0">
      <Toolbar>
        <SearchBox placeholder="Search activity" />
        <FilterSelect param="user" label="User" allLabel="Everyone" options={users} />
        <FilterSelect param="entity" label="Record" allLabel="Any" options={entityOptions} />
        <DateRangeFilter />
      </Toolbar>
      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No activity found" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>What</Th>
              <Th>Record</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td className="text-xs whitespace-nowrap">{fmtDateTime(a.createdAt)}</Td>
                <Td className="whitespace-nowrap">{a.userName ?? "System"}</Td>
                <Td>
                  {a.summary}
                  <span className="block text-xs text-a-muted">{a.action.replace(/_/g, " ")}</span>
                </Td>
                <Td>
                  <Badge icon={false}>{a.entity.replace(/_/g, " ")}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination basePath="/admin/activity" params={sp} page={page} pageSize={pageSize} total={total} />
    </Card>
  );
}

async function Security({ sp, page, pageSize, offset, q }: P) {
  let query = adminDb.from(tbl(schema.loginAttempts)).select(cols(schema.loginAttempts), { count: "exact" });
  if (q) query = query.ilike("email", likeTerm(q));
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ rows, total }, week] = await Promise.all([
    paged<Row<typeof schema.loginAttempts>>(query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1)),
    all<{ success: boolean; ipHash: string | null }>(() => adminDb.from(tbl(schema.loginAttempts)).select("success,ipHash:ip_hash").gte("created_at", since).order("id")),
  ]);
  const failed = week.filter((w) => !w.success);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Sign-ins (7 days)" value={week.filter((w) => w.success).length} />
        <Kpi label="Failed attempts (7 days)" value={failed.length} icon={failed.length > 10 ? ShieldAlert : undefined} />
        <Kpi label="Distinct sources of failures" value={new Set(failed.map((f) => f.ipHash)).size} hint="by hashed IP" />
      </div>
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Email" />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState compact title="No sign-in attempts recorded" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Email</Th>
                <Th>Result</Th>
                <Th>Device</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="text-xs whitespace-nowrap">{fmtDateTime(r.createdAt)}</Td>
                  <Td>{r.email}</Td>
                  <Td>{r.success ? <Badge tone="success">Signed in</Badge> : <Badge tone="danger">{r.reason ?? "Failed"}</Badge>}</Td>
                  <Td className="max-w-72 truncate text-xs text-a-muted">{r.userAgent ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/activity" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
