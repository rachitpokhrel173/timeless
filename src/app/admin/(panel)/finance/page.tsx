import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminDb, many, schema, tbl } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr } from "@/lib/format";
import { listParams } from "@/lib/list";
import { RecordPaymentButton } from "@/components/admin/finance/RecordPayment";
import { NewInvoiceButton } from "@/components/admin/finance/FinanceActions";
import { ExportLink, PageHeader, Tabs } from "@/components/admin/ui";
import { InvoicesTab, OutstandingTab, OverviewTab, PaymentsTab, ReceiptsTab } from "./tabs";

export const metadata: Metadata = { title: "Invoices & Payments" };

const TABS = ["overview", "invoices", "payments", "outstanding", "receipts"] as const;
type Tab = (typeof TABS)[number];

/**
 * Invoices & Payments — one workspace over the same connected records: invoices, every payment
 * (with or without an invoice), what is still owed, and receipts. Figures come from the finance
 * views via src/server/finance.ts.
 */
export default async function FinancePage({ searchParams }: PageProps<"/admin/finance">) {
  const user = await requirePage();
  if (!user.permissions.has("invoices.view") && !user.permissions.has("payments.view")) redirect("/admin/denied?need=payments.view");
  const sp = await searchParams;
  const { str } = listParams(sp);
  const has = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const allowed: Tab[] = TABS.filter((t) => (t === "invoices" ? has("invoices.view") : t === "overview" ? true : has("payments.view")));
  const requested = (str("tab") === "reminders" ? "outstanding" : str("tab")) as Tab;
  const tab: Tab = allowed.includes(requested) ? requested : allowed[0]!;

  const invoiceable = has("invoices.create")
    ? (
        await many<{ id: string; number: string; totalAmount: number; e: { title: string; eventDate: string }[]; c: { name: string }; inv: { status: string }[] }>(
          adminDb
            .from(tbl(schema.bookings))
            .select("id,number,totalAmount:total_amount,e:events(title,eventDate:event_date),c:customers!inner(name),inv:invoices(status)")
            .neq("status", "CANCELLED")
            .order("created_at", { ascending: false })
            .limit(300),
        )
      )
        .filter((b) => !b.inv.some((i) => i.status !== "CANCELLED"))
        .map((b) => ({ value: b.id, label: `${b.c.name} — ${b.e[0]?.title ?? b.number} (${b.number}${b.e[0] ? `, ${fmtDate(b.e[0].eventDate)}` : ""}) · ${npr(b.totalAmount)}` }))
    : [];

  return (
    <>
      <PageHeader
        title="Invoices & Payments"
        description="Every invoice and every payment in one place. Payments can be recorded at any time — with or without an invoice — and are always linked to the customer and booking."
        actions={
          <>
            {tab === "payments" && <ExportLink entity="payments" />}
            {tab === "invoices" && <ExportLink entity="invoices" />}
            {has("invoices.create") && <NewInvoiceButton bookings={invoiceable} />}
            {has("payments.create") && (
              <>
                <RecordPaymentButton type="ADVANCE" canAdjust={has("payments.adjust")} canAttach={has("documents.manage")} variant="secondary" />
                <RecordPaymentButton canAdjust={has("payments.adjust")} canAttach={has("documents.manage")} />
              </>
            )}
          </>
        }
      />
      <Tabs
        active={tab}
        items={allowed.map((t) => ({
          key: t,
          href: t === "overview" ? "/admin/finance" : `/admin/finance?tab=${t}`,
          label: { overview: "Overview", invoices: "Invoices", payments: "Payments", outstanding: "Outstanding balances", receipts: "Receipts" }[t],
        }))}
      />
      {tab === "overview" && <OverviewTab canPayments={has("payments.view")} canInvoices={has("invoices.view")} />}
      {tab === "invoices" && <InvoicesTab sp={sp} />}
      {tab === "payments" && <PaymentsTab sp={sp} />}
      {tab === "outstanding" && <OutstandingTab sp={sp} canRecord={has("payments.create")} canAdjust={has("payments.adjust")} canAttach={has("documents.manage")} />}
      {tab === "receipts" && <ReceiptsTab sp={sp} canSend={has("payments.create")} />}
    </>
  );
}
