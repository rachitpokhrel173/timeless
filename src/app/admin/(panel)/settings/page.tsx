import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { adminDb, all, cols, many, maybe, schema, tbl, total, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDateTime, isoDaysFromNow, relativeTime } from "@/lib/format";
import { listParams } from "@/lib/list";
import { serviceRoleConfigured } from "@/lib/supabase/admin";
import { ensureRules } from "@/server/automation";
import { mediaOptions } from "@/server/lookups";
import { storageHealth } from "@/server/storage";
import { quoteSettings } from "../quotations/editor-data";
import { Badge, Card, Notice, PageHeader, Tabs } from "@/components/admin/ui";
import {
  AutomationRow,
  BusinessForm,
  ChecklistButton,
  DeleteChecklistButton,
  ExpenseCategoryButton,
  InvoiceSettingsForm,
  NotificationSettingsForm,
  QuotationSettingsForm,
  RunAutomationsButton,
  SourceButton,
  StageButton,
} from "./SettingsClient";

export const metadata: Metadata = { title: "Settings" };

const TABS = [
  { key: "business", label: "Business" },
  { key: "sales", label: "Quotations & invoices" },
  { key: "automations", label: "Automations" },
  { key: "lists", label: "Lists" },
  { key: "system", label: "System" },
] as const;

const setting = async <T,>(key: string) => (await maybe<{ value: T }>(adminDb.from(tbl(schema.siteSettings)).select("value").eq("key", key)))?.value;

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requirePage("settings.manage");
  const { str } = listParams(await searchParams);
  const tab = TABS.find((t) => t.key === str("tab"))?.key ?? "business";

  return (
    <>
      <PageHeader title="Settings" description="Business configuration used across the website, documents and automations." />
      <Tabs active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/admin/settings?tab=${t.key}` }))} />
      {tab === "business" && <Business />}
      {tab === "sales" && <Sales />}
      {tab === "automations" && <Automations />}
      {tab === "lists" && <Lists />}
      {tab === "system" && <System />}
    </>
  );
}

async function Business() {
  const [business, media] = await Promise.all([setting<Record<string, unknown>>("business"), mediaOptions()]);
  return (
    <Card title="Business details" description="Shown on the website, in the footer, on quotations and invoices, and in search results.">
      <BusinessForm values={business ?? {}} media={media} />
    </Card>
  );
}

async function Sales() {
  const [q, inv, notif] = await Promise.all([quoteSettings(), setting<{ dueDays?: number; notes?: string; bankDetails?: string }>("invoice_settings"), setting<{ emailNewInquiry?: boolean; emailPaymentReceived?: boolean }>("notification_settings")]);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Quotations" description="Defaults for new quotations.">
        <QuotationSettingsForm values={q} />
      </Card>
      <div className="space-y-4">
        <Card title="Invoices">
          <InvoiceSettingsForm values={inv ?? {}} />
        </Card>
        <Card title="Team emails" description="Requires an email provider (see System).">
          <NotificationSettingsForm values={notif ?? {}} />
        </Card>
      </div>
    </div>
  );
}

async function Automations() {
  await ensureRules();
  const [rules, runs] = await Promise.all([
    many<Row<typeof schema.automationRules>>(adminDb.from(tbl(schema.automationRules)).select(cols(schema.automationRules)).order("key")),
    many<Row<typeof schema.automationRuns>>(adminDb.from(tbl(schema.automationRuns)).select(cols(schema.automationRuns)).order("created_at", { ascending: false }).limit(25)),
  ]);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Card title="Automations" description="Event rules run right after the action; daily rules run from the scheduled job (and at most hourly when the dashboard is opened)." actions={<RunAutomationsButton />} bodyClassName="p-0">
        <ul className="divide-y divide-a-border">
          {rules.map((r) => (
            <li key={r.key} className="flex items-start gap-3 px-4 py-3">
              {r.enabled ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-a-success" aria-label="On" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-a-muted" aria-label="Off" />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-a-muted">{r.trigger}</p>
                <p className="mt-1 text-[13px]">{r.description}</p>
                <p className="mt-1 text-xs text-a-muted">
                  {r.lastRunAt ? `Last ran ${relativeTime(r.lastRunAt)} · ${r.runCount} runs` : "Hasn't run yet"}
                  {Object.entries(r.config).map(([k, v]) => ` · ${k}: ${String(v)}`)}
                </p>
              </div>
              <AutomationRow rule={r} />
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Recent runs" bodyClassName="p-0">
        {runs.length === 0 ? (
          <p className="p-4 text-[13px] text-a-muted">No runs yet.</p>
        ) : (
          <ul className="divide-y divide-a-border text-[13px]">
            {runs.map((r) => (
              <li key={r.id} className="px-4 py-2.5">
                <p className={r.ok ? undefined : "text-a-danger"}>{r.summary}</p>
                <p className="text-xs text-a-muted">
                  {r.ruleKey} · {fmtDateTime(r.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

async function Lists() {
  const [sources, categories, checklists, stages] = await Promise.all([
    many<Row<typeof schema.campaignSources>>(adminDb.from(tbl(schema.campaignSources)).select(cols(schema.campaignSources)).order("position")),
    many<Row<typeof schema.expenseCategories>>(adminDb.from(tbl(schema.expenseCategories)).select(cols(schema.expenseCategories)).order("position")),
    many<Row<typeof schema.checklistTemplates>>(adminDb.from(tbl(schema.checklistTemplates)).select(cols(schema.checklistTemplates)).order("name")),
    many<Row<typeof schema.salesPipelineStages>>(adminDb.from(tbl(schema.salesPipelineStages)).select(cols(schema.salesPipelineStages)).order("position")),
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Lead sources" description="Where clients find you — used on leads, bookings and reports." actions={<SourceButton />} bodyClassName="p-0">
        <ul className="divide-y divide-a-border">
          {sources.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
              <span>
                {s.name} <span className="text-xs text-a-muted">{s.key}</span> {!s.active && <Badge>Inactive</Badge>}
              </span>
              <SourceButton values={s} />
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Expense categories" actions={<ExpenseCategoryButton />} bodyClassName="p-0">
        <ul className="divide-y divide-a-border">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
              {c.name}
              <ExpenseCategoryButton values={c} />
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Event checklists" description="Added to events in one click from the Tasks tab." actions={<ChecklistButton />} bodyClassName="p-0">
        <ul className="divide-y divide-a-border">
          {checklists.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
              <span>
                {c.name}
                <span className="block text-xs text-a-muted">
                  {c.phase === "PRE" ? "Before" : "After"} the event · {c.items.length} items
                </span>
              </span>
              <span className="flex">
                <ChecklistButton values={c} />
                <DeleteChecklistButton id={c.id} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Pipeline stages" description="Names shown on the sales pipeline." bodyClassName="p-0">
        <ul className="divide-y divide-a-border">
          {stages.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
              <span>
                {s.name} <span className="text-xs text-a-muted">{s.key}</span>
              </span>
              <StageButton values={s} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

async function System() {
  const [storage, outbox, lastEmail, sweep] = await Promise.all([
    storageHealth(),
    all<{ status: string }>(() => adminDb.from(tbl(schema.emailOutbox)).select("status").gte("created_at", isoDaysFromNow(-30)).order("id")),
    maybe<{ createdAt: Date; subject: string; status: string }>(adminDb.from(tbl(schema.emailOutbox)).select("createdAt:created_at,subject,status").order("created_at", { ascending: false }).limit(1)),
    setting<{ at: string }>("automation_last_sweep"),
  ]);
  const users = await total(adminDb.from(tbl(schema.userRoles)).select("user_id", { count: "exact", head: true }));
  const checks: [string, boolean, string][] = [
    ["Database (Supabase Postgres)", true, "Connected — you're reading live data"],
    ["Privileged server key", serviceRoleConfigured(), serviceRoleConfigured() ? "SUPABASE_SERVICE_ROLE_KEY is set (server only)" : "SUPABASE_SERVICE_ROLE_KEY is missing"],
    ["File storage", storage.ok, storage.detail],
    ["Scheduled automations", !!process.env.CRON_SECRET, process.env.CRON_SECRET ? `Cron secret set${sweep ? ` · last sweep ${relativeTime(sweep.at)}` : ""}` : `No CRON_SECRET — runs hourly when the dashboard is opened${sweep ? ` (last ${relativeTime(sweep.at)})` : ""}`],
    process.env.RESEND_API_KEY && process.env.EMAIL_FROM
      ? ["Email delivery", true, `Sending through Resend from ${process.env.EMAIL_FROM}`]
      : ["Email delivery", false, "Not connected — emails are recorded in the outbox but not sent. Set RESEND_API_KEY and EMAIL_FROM (an address on your domain verified in Resend) to send them."],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="System health" bodyClassName="p-0">
        <ul className="divide-y divide-a-border">
          {checks.map(([name, ok, detail]) => (
            <li key={name} className="flex items-start gap-3 px-4 py-3">
              {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-a-success" aria-label="OK" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-a-warning" aria-label="Needs attention" />}
              <div>
                <p className="font-medium">{name}</p>
                <p className="text-[13px] text-a-muted">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-4">
        <Card title="Email outbox (30 days)">
          <p className="text-[13px]">
            {outbox.length} email{outbox.length === 1 ? "" : "s"} generated · {outbox.filter((o) => o.status === "SENT").length} sent
          </p>
          {lastEmail && (
            <p className="mt-1 text-xs text-a-muted">
              Latest: “{lastEmail.subject}” ({lastEmail.status.toLowerCase().replace("_", " ")}) {relativeTime(lastEmail.createdAt)}
            </p>
          )}
        </Card>
        <Card title="Access">
          <p className="text-[13px]">{users} role assignment{users === 1 ? "" : "s"} across admin users.</p>
          <div className="mt-3">
            <Notice tone="info">Manage who can sign in and what they can do under Users & Roles. Every permission is enforced by the database (Row Level Security), not just the interface.</Notice>
          </div>
        </Card>
      </div>
    </div>
  );
}
