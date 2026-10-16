import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, Wallet } from "lucide-react";
import { adminDb, all, cols, many, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr, todayISO } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { PAYMENT_METHODS } from "@/server/finance";
import { outstandingBookings, type OutstandingBooking } from "@/server/payment-reminders";
import { DateRangeFilter, FilterSelect, SearchBox } from "@/components/admin/interactive";
import { label } from "@/components/admin/status";
import { Badge, ExportLink, Card, EmptyState, Kpi, PageHeader, Pagination, Table, Tabs, Td, Th, Toolbar } from "@/components/admin/ui";
import { PaymentReminderButton, VoidPaymentButton } from "../bookings/BookingClient";
import { RecordPaymentDialog } from "./PaymentsClient";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const user = await requirePage("payments.view");
  const sp = await searchParams;
  const { str } = listParams(sp, 40);
  const canCreate = user.permissions.has("payments.create");
  const reminders = str("tab") === "reminders";
  const owed = await outstandingBookings();
  const methods = PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }));

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every amount received from clients, and reminders for what's still owed. Booking and invoice balances update automatically."
        actions={
          <>
            <ExportLink entity="payments" />
            {canCreate && <RecordPaymentDialog bookings={owed} methods={methods} />}
          </>
        }
      />
      <Tabs
        active={reminders ? "reminders" : "payments"}
        items={[
          { key: "payments", label: "Payments received", href: "/admin/payments" },
          { key: "reminders", label: "Money owed & reminders", href: "/admin/payments?tab=reminders", count: owed.length },
        ]}
      />
      {reminders ? <Reminders owed={owed} canSend={canCreate} /> : <Received sp={sp} canVoid={canCreate} />}
    </>
  );
}

/** The payment log: every amount received, with filters. */
async function Received({ sp, canVoid }: { sp: Awaited<PageProps<"/admin/payments">["searchParams"]>; canVoid: boolean }) {
  const { page, pageSize, offset, q, str } = listParams(sp, 40);
  const from = str("from");
  const to = str("to");
  const today = todayISO();
  const monthStart = `${today.slice(0, 8)}01`;

  let query = adminDb
    .from(tbl(schema.payments))
    .select(`${cols(schema.payments)},customer:customers!inner(id,name),booking:bookings!inner(id,number),inv:invoices(id,number)`, { count: "exact" });
  if (str("method") && (PAYMENT_METHODS as readonly string[]).includes(str("method")!)) query = query.eq("method", str("method")!);
  if (str("show") === "void") query = query.not("voided_at", "is", null);
  else query = query.is("voided_at", null);
  if (from) query = query.gte("paid_at", from);
  if (to) query = query.lte("paid_at", to);
  if (q) {
    const term = pgrstValue(likeTerm(q));
    query = query.or(`number.ilike.${term},reference.ilike.${term}`);
  }
  const { rows, total } = await paged<Row<typeof schema.payments> & { customer: { id: string; name: string }; booking: { id: string; number: string }; inv: { id: string; number: string } | null }>(
    query.order("paid_at", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1),
  );
  const recent = await all<{ amount: number; paidAt: string }>(() =>
    adminDb.from(tbl(schema.payments)).select("amount,paidAt:paid_at").is("voided_at", null).gte("paid_at", `${String(Number(today.slice(0, 4)) - 1)}${today.slice(4, 8)}01`).order("id"),
  );
  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);
  const lastMonthStart = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="This month" value={npr(sum(recent.filter((p) => p.paidAt >= monthStart)))} />
        <Kpi label="Last month" value={npr(sum(recent.filter((p) => p.paidAt >= lastMonthStart && p.paidAt < monthStart)))} />
        <Kpi label="Last 12 months" value={npr(sum(recent))} />
      </div>
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Receipt no. or reference" />
          <FilterSelect param="method" label="Method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }))} />
          <FilterSelect param="show" label="Show" allLabel="Valid" options={[{ value: "void", label: "Voided" }]} />
          <DateRangeFilter />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments found">
            Use Record payment above — it&apos;s added to the client&apos;s booking.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Booking</Th>
                <Th>Method</Th>
                <Th className="text-right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-a-subtle/60">
                  <Td>
                    <span className="font-medium">{p.number}</span>
                    {p.reference && <span className="block text-xs text-a-muted">{p.reference}</span>}
                  </Td>
                  <Td>{fmtDate(p.paidAt)}</Td>
                  <Td>
                    <Link href={`/admin/customers/${p.customer.id}`} className="hover:underline">
                      {p.customer.name}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/admin/bookings/${p.booking.id}?tab=payments`} className="hover:underline">
                      {p.booking.number}
                    </Link>
                    {p.inv && (
                      <Link href={`/admin/invoices/${p.inv.id}`} className="block text-xs text-a-muted hover:underline">
                        {p.inv.number}
                      </Link>
                    )}
                  </Td>
                  <Td>{label(p.method)}</Td>
                  <Td className={`text-right font-medium tabular-nums ${p.voidedAt ? "text-a-muted line-through" : ""}`}>{npr(p.amount)}</Td>
                  <Td className="text-right">{p.voidedAt ? <Badge tone="danger">Void</Badge> : canVoid && <VoidPaymentButton id={p.id} number={p.number} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/payments" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}

type LogRow = { id: string; to: string; status: "SENT" | "FAILED" | "NOT_CONFIGURED"; entityType: string | null; entityId: string | null; createdAt: string; error: string | null };

const REMINDER_STATUS = {
  SENT: { tone: "success", label: "Sent" },
  FAILED: { tone: "danger", label: "Failed" },
  NOT_CONFIGURED: { tone: "warning", label: "Not sent — email off" },
} as const;

/** Who owes money (each with a send button) and every payment reminder that has gone out. */
async function Reminders({ owed, canSend }: { owed: OutstandingBooking[]; canSend: boolean }) {
  const today = todayISO();
  const log = await many<LogRow>(
    adminDb
      .from(tbl(schema.emailOutbox))
      .select("id,to,status,entityType:entity_type,entityId:entity_id,createdAt:created_at,error")
      .eq("template", "paymentReminder")
      .order("created_at", { ascending: false })
      .limit(100),
  );
  // Automatic reminders are keyed "<bookingId>:<stage>:<due date>:<soon|late>"; manual ones use the booking id
  const bookingOf = (r: LogRow) => r.entityId?.split(":")[0] ?? null;
  const ids = [...new Set(log.map(bookingOf).filter((x): x is string => !!x))];
  const numbers = ids.length ? await many<{ id: string; number: string }>(adminDb.from(tbl(schema.bookings)).select("id,number").in("id", ids)) : [];
  const numberOf = new Map(numbers.map((b) => [b.id, b.number]));
  const lastSent = new Map<string, string>();
  for (const r of log) {
    const b = bookingOf(r);
    if (b && r.status === "SENT" && !lastSent.has(b)) lastSent.set(b, r.createdAt);
  }
  const overdue = owed.filter((b) => b.due.dueDate && b.due.dueDate < today);
  const plural = (n: number) => `${n} booking${n === 1 ? "" : "s"}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Total owed" value={npr(owed.reduce((n, b) => n + b.total - b.paid, 0))} hint={plural(owed.length)} />
        <Kpi label="Overdue" value={npr(overdue.reduce((n, b) => n + b.due.amount, 0))} hint={plural(overdue.length)} />
        <Kpi label="Reminders sent this month" value={log.filter((r) => r.status === "SENT" && r.createdAt.slice(0, 7) === today.slice(0, 7)).length} />
      </div>

      <Card
        title="Money owed"
        description="Clients get an automatic reminder before each due date and once if it's overdue (Settings → Automations). You can also send one yourself."
        bodyClassName="p-0"
      >
        {owed.length === 0 ? (
          <EmptyState icon={Wallet} title="Nothing owed">
            Every active booking is fully paid.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Next payment</Th>
                <Th>Due</Th>
                <Th className="text-right">Total owed</Th>
                <Th>Last reminder</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {owed.map((b) => {
                const late = !!b.due.dueDate && b.due.dueDate < today;
                const sent = lastSent.get(b.id);
                return (
                  <tr key={b.id} className="hover:bg-a-subtle/60">
                    <Td>
                      <Link href={`/admin/bookings/${b.id}?tab=payments`} className="font-medium hover:underline">
                        {b.customer}
                      </Link>
                      <span className="block max-w-64 truncate text-xs text-a-muted">
                        {b.number} · {b.title}
                        {b.eventDate && ` · ${fmtDate(b.eventDate)}`}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-medium tabular-nums">{npr(b.due.amount)}</span>
                      <span className="block text-xs text-a-muted">{b.due.stage === "advance" ? "Advance" : "Balance"}</span>
                    </Td>
                    <Td>
                      {b.due.dueDate ? <span className={late ? "font-medium text-a-danger" : undefined}>{fmtDate(b.due.dueDate)}</span> : <span className="text-a-muted">—</span>}
                      {late && <span className="block text-xs text-a-danger">Overdue</span>}
                    </Td>
                    <Td className="text-right font-medium tabular-nums">{npr(b.total - b.paid)}</Td>
                    <Td className="text-xs text-a-muted">{sent ? fmtDateTime(sent) : b.email ? "None yet" : "No email on file"}</Td>
                    <Td className="text-right">{canSend && <PaymentReminderButton id={b.id} email={b.email} due={b.due} />}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Reminder log" description="Every payment reminder emailed to a client, newest first." bodyClassName="p-0">
        {log.length === 0 ? (
          <EmptyState icon={BellRing} title="No reminders yet">
            They appear here once one goes out, automatically or with Send reminder.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sent</Th>
                <Th>Booking</Th>
                <Th>To</Th>
                <Th>Type</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {log.map((r) => {
                const booking = bookingOf(r);
                const kind = r.entityType === "payment-reminder" ? (r.entityId?.endsWith(":late") ? "Automatic · overdue" : "Automatic · due soon") : "Manual";
                const st = REMINDER_STATUS[r.status];
                return (
                  <tr key={r.id} className="hover:bg-a-subtle/60">
                    <Td className="text-xs whitespace-nowrap">{fmtDateTime(r.createdAt)}</Td>
                    <Td>
                      {booking && numberOf.has(booking) ? (
                        <Link href={`/admin/bookings/${booking}?tab=payments`} className="hover:underline">
                          {numberOf.get(booking)}
                        </Link>
                      ) : (
                        <span className="text-a-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-xs">{r.to}</Td>
                    <Td className="text-xs">{kind}</Td>
                    <Td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {r.error && (
                        <span className="block max-w-56 truncate text-[11px] text-a-muted" title={r.error}>
                          {r.error}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
