import Link from "@/components/admin/Link";
import { BellRing, FileText, Receipt, Wallet } from "lucide-react";
import { adminDb, all, cols, many, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { ALLOCATION_STATE, BOOKING_PAY_STATUS, METHOD_LABEL, methodLabel, PAYMENT_STATE, PAYMENT_TYPE_LABEL } from "@/lib/finance";
import { fmtDate, fmtDateTime, npr, nprCompact, todayISO } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { BOOKING_FINANCE_COLS, financeOverview, LEDGER_COLS, type BookingFinance, type LedgerRow } from "@/server/finance";
import { amountDue } from "@/server/payment-reminders";
import { ColumnChart } from "@/components/admin/charts";
import { EmailReceiptButton, ReceiptLink } from "@/components/admin/finance/FinanceActions";
import { RecordPaymentButton } from "@/components/admin/finance/RecordPayment";
import { DateRangeFilter, FilterSelect, SearchBox } from "@/components/admin/interactive";
import { INVOICE_STATUS, options, StatusBadge } from "@/components/admin/status";
import { Badge, Card, EmptyState, Kpi, LinkButton, Notice, Pagination, Table, Td, Th, Toolbar } from "@/components/admin/ui";
import { PaymentReminderButton } from "../bookings/BookingClient";

type SP = Record<string, string | string[] | undefined>;
const INVOICE_STATUSES = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"] as const;

/** Customer ids whose name matches a search (for filtering lists by customer). */
async function customerIdsMatching(q: string) {
  const rows = await many<{ id: string }>(adminDb.from(tbl(schema.customers)).select("id").ilike("name", likeTerm(q)).limit(100));
  return rows.map((r) => r.id);
}

export function LedgerStatus({ p }: { p: Pick<LedgerRow, "status" | "allocationState"> }) {
  const s = PAYMENT_STATE[p.status]!;
  const a = ALLOCATION_STATE[p.allocationState]!;
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone={s.tone}>{s.label}</Badge>
      {p.status !== "REVERSED" && p.allocationState !== "INVOICED" && <Badge tone={a.tone}>{a.label}</Badge>}
    </span>
  );
}

/* ───────── Overview ───────── */

export async function OverviewTab({ canPayments, canInvoices }: { canPayments: boolean; canInvoices: boolean }) {
  const today = todayISO();
  const [o, recentInvoices, recentPayments, owing] = await Promise.all([
    financeOverview(today),
    canInvoices
      ? many<Row<typeof schema.invoices> & { c: { name: string } }>(adminDb.from(tbl(schema.invoices)).select(`${cols(schema.invoices)},c:customers!inner(name)`).order("created_at", { ascending: false }).limit(6))
      : [],
    canPayments ? many<LedgerRow>(adminDb.from("payment_ledger").select(LEDGER_COLS).order("created_at", { ascending: false }).limit(8)) : [],
    canPayments
      ? many<{ customerId: string; customerName: string; outstanding: number; received: number; bookings: number }>(
          adminDb.from("customer_finance").select("customerId:customer_id,customerName:customer_name,outstanding,received,bookings").gt("outstanding", 0).order("outstanding", { ascending: false }).limit(8),
        )
      : [],
  ]);
  const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

  return (
    <div className="space-y-5">
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {canInvoices && <Kpi label="Total invoiced" value={nprCompact(o.totalInvoiced)} hint="Issued invoices" href="/admin/finance?tab=invoices" />}
        {canPayments && <Kpi label="Payments received" value={nprCompact(o.totalReceived)} hint="Net of refunds & reversals" href="/admin/finance?tab=payments" />}
        {canPayments && <Kpi label="Total outstanding" value={nprCompact(o.bookingOutstanding)} hint="Still owed on bookings" href="/admin/finance?tab=outstanding" invert />}
        {canPayments && <Kpi label="Advance payments" value={nprCompact(o.advanceReceived)} href="/admin/finance?tab=payments&kind=advance" />}
        {canInvoices && <Kpi label="Overdue invoices" value={nprCompact(o.overdueAmount)} hint={`${o.overdueCount} invoice${o.overdueCount === 1 ? "" : "s"}`} href="/admin/finance?tab=invoices&status=OVERDUE" invert />}
        {canPayments && <Kpi label="Received this month" value={nprCompact(o.receivedThisMonth)} hint={`${o.paymentsThisMonth} payment${o.paymentsThisMonth === 1 ? "" : "s"}`} />}
      </section>

      {canPayments && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card title="Money received by month" description="Actual payments received (by payment date), net of refunds and reversals — not invoiced amounts.">
            <ColumnChart labels={o.trend.map((t) => monthName(t.month))} series={[{ name: "Received", values: o.trend.map((t) => t.value) }]} format="npr" ariaLabel="Money received by month" />
          </Card>
          <Card title="Where the balance stands">
            <dl className="space-y-2 text-[13px]">
              <Line label="Owed on invoices" value={o.invoiceOutstanding} hint="Issued invoices not yet paid" />
              <Line label="Owed on bookings not yet invoiced" value={o.uninvoicedOutstanding} hint="Not a formal receivable until invoiced" />
              <div className="border-t border-a-border pt-2" />
              <Line label="Total outstanding" value={o.bookingOutstanding} strong />
              <div className="border-t border-a-border pt-2" />
              <Line label="Received, not yet on an invoice" value={o.notOnInvoice} hint="Advances etc. — applied when the invoice is created" />
              <Line label="Customer credit" value={o.customerCredit} hint="Overpayments and unassigned payments" />
              <Line label="Refunded this month" value={o.refundsThisMonth} />
            </dl>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {canPayments && (
          <Card title="Recent transactions" bodyClassName="p-0" actions={<LinkButton href="/admin/finance?tab=payments" size="sm" variant="ghost">All payments</LinkButton>}>
            {recentPayments.length === 0 ? (
              <EmptyState compact icon={Wallet} title="No payments yet" />
            ) : (
              <ul className="divide-y divide-a-border text-[13px]">
                {recentPayments.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/finance/payments/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-a-subtle/50">
                      <span className="min-w-0">
                        <span className="font-medium">{p.customerName}</span>
                        <span className="block truncate text-xs text-a-muted">
                          {p.number} · {fmtDate(p.paidAt)} · {methodLabel(p.method)}
                          {p.bookingNumber ? ` · ${p.bookingNumber}` : " · unassigned"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block font-medium tabular-nums ${p.status === "REVERSED" ? "text-a-muted line-through" : ""}`}>{npr(p.amount)}</span>
                        {p.paymentType === "ADVANCE" && <span className="text-xs text-a-muted">Advance</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {canInvoices && (
          <Card title="Recent invoices" bodyClassName="p-0" actions={<LinkButton href="/admin/finance?tab=invoices" size="sm" variant="ghost">All invoices</LinkButton>}>
            {recentInvoices.length === 0 ? (
              <EmptyState compact icon={FileText} title="No invoices yet" />
            ) : (
              <ul className="divide-y divide-a-border text-[13px]">
                {recentInvoices.map((i) => (
                  <li key={i.id}>
                    <Link href={`/admin/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-a-subtle/50">
                      <span className="min-w-0">
                        <span className="font-medium">{i.number}</span> · {i.c.name}
                        <span className="block text-xs text-a-muted">
                          {npr(i.amountPaid)} of {npr(i.total)} paid · due {fmtDate(i.dueDate)}
                        </span>
                      </span>
                      <StatusBadge map={INVOICE_STATUS} value={i.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {canPayments && (
        <Card title="Customers with outstanding balances" bodyClassName="p-0" actions={<LinkButton href="/admin/finance?tab=outstanding" size="sm" variant="ghost">All balances</LinkButton>}>
          {owing.length === 0 ? (
            <EmptyState compact title="Nobody owes money" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th className="text-right">Received</Th>
                  <Th className="text-right">Outstanding</Th>
                </tr>
              </thead>
              <tbody>
                {owing.map((c) => (
                  <tr key={c.customerId} className="hover:bg-a-subtle/60">
                    <Td>
                      <Link href={`/admin/customers/${c.customerId}`} className="font-medium hover:underline">
                        {c.customerName}
                      </Link>
                      <span className="block text-xs text-a-muted">
                        {c.bookings} booking{c.bookings === 1 ? "" : "s"}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">{npr(c.received)}</Td>
                    <Td className="text-right font-medium text-a-warning tabular-nums">{npr(c.outstanding)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

function Line({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <dt>
        {label}
        {hint && <span className="block text-xs font-normal text-a-muted">{hint}</span>}
      </dt>
      <dd className="tabular-nums">{npr(value)}</dd>
    </div>
  );
}

/* ───────── Invoices ───────── */

type InvoiceRow = Row<typeof schema.invoices> & { customer: { id: string; name: string }; booking: { id: string; number: string; events: { id: string; title: string }[] } };

export async function InvoicesTab({ sp }: { sp: SP }) {
  const { page, pageSize, offset, q, str } = listParams(sp, 30);
  const status = str("status");
  const today = todayISO();
  let query = adminDb
    .from(tbl(schema.invoices))
    .select(`${cols(schema.invoices)},customer:customers!inner(id,name),booking:bookings!inner(id,number,events(id,title))`, { count: "exact" });
  if (status === "OVERDUE") query = query.or(`status.eq.OVERDUE,and(status.in.(SENT,PARTIALLY_PAID),due_date.lt.${today})`);
  else if (status === "open") query = query.in("status", ["SENT", "PARTIALLY_PAID", "OVERDUE"]);
  else if (status && (INVOICE_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (q) {
    const ids = await customerIdsMatching(q);
    query = query.or(`number.ilike.${pgrstValue(likeTerm(q))}${ids.length ? `,customer_id.in.(${ids.join(",")})` : ""}`);
  }
  const { rows, total } = await paged<InvoiceRow>(query.order("issue_date", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1));

  return (
    <Card bodyClassName="p-0">
      <Toolbar>
        <SearchBox placeholder="Invoice number or customer" />
        <FilterSelect param="status" label="Status" options={[{ value: "open", label: "Open (unpaid)" }, ...options(INVOICE_STATUSES, INVOICE_STATUS)]} />
      </Toolbar>
      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices found">
          Use Create invoice above, or from a booking.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Customer</Th>
              <Th>Event</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Paid</Th>
              <Th className="text-right">Balance</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const balance = Math.max(0, i.total - i.amountPaid);
              const late = balance > 0 && !!i.dueDate && i.dueDate < today && !["CANCELLED", "DRAFT"].includes(i.status);
              const ev = i.booking.events[0];
              return (
                <tr key={i.id} className="hover:bg-a-subtle/60">
                  <Td>
                    <Link href={`/admin/invoices/${i.id}`} className="font-medium hover:underline">
                      {i.number}
                    </Link>
                    <Link href={`/admin/bookings/${i.booking.id}`} className="block text-xs text-a-muted hover:underline">
                      {i.booking.number}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/admin/customers/${i.customer.id}`} className="hover:underline">
                      {i.customer.name}
                    </Link>
                  </Td>
                  <Td className="max-w-48 truncate text-xs">{ev ? <Link href={`/admin/events/${ev.id}?tab=finance`} className="hover:underline">{ev.title}</Link> : "—"}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(i.issueDate)}</Td>
                  <Td className={`whitespace-nowrap ${late ? "font-medium text-a-danger" : ""}`}>{fmtDate(i.dueDate)}</Td>
                  <Td className="text-right tabular-nums">{npr(i.total)}</Td>
                  <Td className="text-right tabular-nums">{i.status === "CANCELLED" ? "—" : npr(i.amountPaid)}</Td>
                  <Td className="text-right font-medium tabular-nums">{i.status === "CANCELLED" ? "—" : npr(balance)}</Td>
                  <Td>
                    <StatusBadge map={INVOICE_STATUS} value={late && i.status !== "OVERDUE" ? "OVERDUE" : i.status} />
                  </Td>
                  <Td className="text-right">
                    <a href={`/admin/print/invoice/${i.id}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-a-accent hover:underline">
                      PDF
                    </a>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination basePath="/admin/finance" params={{ ...sp, tab: "invoices" }} page={page} pageSize={pageSize} total={total} />
    </Card>
  );
}

/* ───────── Payments ───────── */

export async function PaymentsTab({ sp }: { sp: SP }) {
  const { page, pageSize, offset, q, str } = listParams(sp, 40);
  const kind = str("kind");
  const method = str("method");
  const show = str("show");
  let query = adminDb.from("payment_ledger").select(LEDGER_COLS, { count: "exact" });
  if (kind === "advance") query = query.eq("payment_type", "ADVANCE");
  if (kind === "invoice") query = query.in("allocation_state", ["INVOICED", "PARTIAL"]);
  if (kind === "unallocated") query = query.gt("unallocated", 0);
  if (kind === "unassigned") query = query.eq("allocation_state", "UNASSIGNED");
  if (method && method in METHOD_LABEL) query = query.eq("method", method);
  if (show === "reversed") query = query.eq("status", "REVERSED");
  else if (show === "refunded") query = query.in("status", ["REFUNDED", "PARTIALLY_REFUNDED"]);
  else if (show !== "all") query = query.neq("status", "REVERSED");
  if (str("from")) query = query.gte("paid_at", str("from")!);
  if (str("to")) query = query.lte("paid_at", str("to")!);
  if (q) {
    const t = pgrstValue(likeTerm(q));
    query = query.or(`number.ilike.${t},reference.ilike.${t},customer_name.ilike.${t},booking_number.ilike.${t}`);
  }
  const { rows, total } = await paged<LedgerRow>(query.order("paid_at", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1));

  return (
    <Card bodyClassName="p-0">
      <Toolbar>
        <SearchBox placeholder="Receipt no., reference, customer, booking" />
        <FilterSelect
          param="kind"
          label="Kind"
          options={[
            { value: "advance", label: "Advance payments" },
            { value: "invoice", label: "Invoice payments" },
            { value: "unallocated", label: "Not on an invoice" },
            { value: "unassigned", label: "Unassigned (customer credit)" },
          ]}
        />
        <FilterSelect param="method" label="Method" options={Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }))} />
        <FilterSelect param="show" label="Show" allLabel="Valid" options={[{ value: "refunded", label: "Refunded" }, { value: "reversed", label: "Reversed" }, { value: "all", label: "Everything" }]} />
        <DateRangeFilter />
      </Toolbar>
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No payments found">
          Use Record payment above — no invoice is needed.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Payment</Th>
              <Th>Date</Th>
              <Th>Customer</Th>
              <Th>Booking / event</Th>
              <Th>Invoice</Th>
              <Th>Method</Th>
              <Th className="text-right">Amount</Th>
              <Th>Status</Th>
              <Th>Recorded by</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-a-subtle/60">
                <Td>
                  <Link href={`/admin/finance/payments/${p.id}`} className="font-medium hover:underline">
                    {p.number}
                  </Link>
                  <span className="block text-xs text-a-muted">
                    {PAYMENT_TYPE_LABEL[p.paymentType]}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">{fmtDate(p.paidAt)}</Td>
                <Td>
                  <Link href={`/admin/customers/${p.customerId}`} className="hover:underline">
                    {p.customerName}
                  </Link>
                </Td>
                <Td className="text-xs">
                  {p.bookingId ? (
                    <>
                      <Link href={`/admin/bookings/${p.bookingId}?tab=payments`} className="block hover:underline">
                        {p.bookingNumber}
                      </Link>
                      {p.eventId && (
                        <Link href={`/admin/events/${p.eventId}?tab=finance`} className="block max-w-44 truncate text-a-muted hover:underline">
                          {p.eventTitle}
                        </Link>
                      )}
                    </>
                  ) : (
                    <span className="text-a-warning">Unassigned</span>
                  )}
                </Td>
                <Td className="text-xs">{p.invoiceNumbers ?? "—"}</Td>
                <Td>{methodLabel(p.method)}</Td>
                <Td className={`text-right font-medium tabular-nums ${p.status === "REVERSED" ? "text-a-muted line-through" : ""}`}>
                  {npr(p.amount)}
                  {p.refunded > 0 && <span className="block text-xs font-normal text-a-muted">−{npr(p.refunded)} refunded</span>}
                </Td>
                <Td>
                  <LedgerStatus p={p} />
                </Td>
                <Td className="text-xs text-a-muted">{p.recordedByName ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination basePath="/admin/finance" params={{ ...sp, tab: "payments" }} page={page} pageSize={pageSize} total={total} />
    </Card>
  );
}

/* ───────── Outstanding balances ───────── */

export async function OutstandingTab({ sp, canRecord, canAdjust, canAttach }: { sp: SP; canRecord: boolean; canAdjust: boolean; canAttach: boolean }) {
  const { q, str } = listParams(sp);
  const today = todayISO();
  const scope = str("scope");
  const build = () => {
    let query = adminDb.from("booking_finance").select(BOOKING_FINANCE_COLS).gt("outstanding", 0);
    if (scope === "invoiced") query = query.gt("invoice_count", 0);
    if (scope === "uninvoiced") query = query.eq("invoice_count", 0);
    if (str("from")) query = query.gte("event_date", str("from")!);
    if (str("to")) query = query.lte("event_date", str("to")!);
    if (q) {
      const t = pgrstValue(likeTerm(q));
      query = query.or(`customer_name.ilike.${t},booking_number.ilike.${t},event_title.ilike.${t}`);
    }
    return query.order("event_date", { ascending: true, nullsFirst: false }).order("booking_id");
  };
  let rows = await all<BookingFinance>(build);
  const dueOf = (b: BookingFinance) => b.invoiceDueDate ?? amountDue({ ...b, amountPaid: b.received })?.dueDate ?? b.balanceDueDate;
  if (str("overdue") === "1") rows = rows.filter((b) => {
    const d = dueOf(b);
    return !!d && d < today;
  });

  const [invoices, contacts, log] = await Promise.all([
    rows.length
      ? many<{ id: string; number: string; status: string; total: number; amountPaid: number; bookingId: string }>(
          adminDb.from(tbl(schema.invoices)).select("id,number,status,total,amountPaid:amount_paid,bookingId:booking_id").in("booking_id", rows.map((r) => r.bookingId)).not("status", "in", "(CANCELLED,PAID)"),
        )
      : [],
    rows.length ? many<{ id: string; phone: string | null; email: string | null }>(adminDb.from(tbl(schema.customers)).select("id,phone,email").in("id", [...new Set(rows.map((r) => r.customerId))])) : [],
    many<{ id: string; to: string; status: string; entityType: string | null; entityId: string | null; createdAt: Date; error: string | null }>(
      adminDb.from(tbl(schema.emailOutbox)).select("id,to,status,entityType:entity_type,entityId:entity_id,createdAt:created_at,error").eq("template", "paymentReminder").order("created_at", { ascending: false }).limit(60),
    ),
  ]);
  const contact = new Map(contacts.map((c) => [c.id, c]));
  const sum = (f: (b: BookingFinance) => number) => rows.reduce((s, b) => s + f(b), 0);
  const invoicedRows = rows.filter((b) => b.invoiceCount > 0);
  const lastSent = new Map<string, Date>();
  for (const r of log) {
    const b = r.entityId?.split(":")[0];
    if (b && r.status === "SENT" && !lastSent.has(b)) lastSent.set(b, r.createdAt);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total outstanding" value={npr(sum((b) => b.outstanding))} hint={`${rows.length} booking${rows.length === 1 ? "" : "s"}`} />
        <Kpi label="On issued invoices" value={npr(sum((b) => b.invoiceOutstanding))} hint={`${invoicedRows.length} invoiced`} href="/admin/finance?tab=outstanding&scope=invoiced" />
        <Kpi label="Bookings not yet invoiced" value={npr(sum((b) => (b.invoiceCount === 0 ? b.outstanding : 0)))} hint="Booking balance, not an invoice" href="/admin/finance?tab=outstanding&scope=uninvoiced" />
        <Kpi label="Overdue" value={npr(rows.filter((b) => (dueOf(b) ?? "9999") < today).reduce((s, b) => s + b.outstanding, 0))} href="/admin/finance?tab=outstanding&overdue=1" invert />
      </div>
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Customer, booking or event" />
          <FilterSelect param="scope" label="Billing" options={[{ value: "invoiced", label: "Invoiced" }, { value: "uninvoiced", label: "Not yet invoiced" }]} />
          <FilterSelect param="overdue" label="Due" allLabel="Any" options={[{ value: "1", label: "Overdue only" }]} />
          <DateRangeFilter />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="Nothing outstanding">
            Every active booking matching these filters is fully paid.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Booking / event</Th>
                <Th className="text-right">Booking amount</Th>
                <Th className="text-right">Invoiced</Th>
                <Th className="text-right">Received</Th>
                <Th className="text-right">Outstanding</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const due = dueOf(b);
                const late = !!due && due < today;
                const c = contact.get(b.customerId);
                const st = BOOKING_PAY_STATUS[b.paymentStatus]!;
                const reminder = amountDue({ ...b, amountPaid: b.received });
                const sent = lastSent.get(b.bookingId);
                const bookingInvoices = invoices.filter((i) => i.bookingId === b.bookingId);
                return (
                  <tr key={b.bookingId} className="align-top hover:bg-a-subtle/60">
                    <Td>
                      <Link href={`/admin/customers/${b.customerId}`} className="font-medium hover:underline">
                        {b.customerName}
                      </Link>
                      {c?.phone && <span className="block text-xs text-a-muted">{c.phone}</span>}
                    </Td>
                    <Td className="text-xs">
                      <Link href={`/admin/bookings/${b.bookingId}?tab=payments`} className="block font-medium hover:underline">
                        {b.bookingNumber}
                      </Link>
                      {b.eventId && (
                        <Link href={`/admin/events/${b.eventId}?tab=finance`} className="block max-w-48 truncate text-a-muted hover:underline">
                          {b.eventTitle} · {fmtDate(b.eventDate)}
                        </Link>
                      )}
                      {bookingInvoices.map((i) => (
                        <Link key={i.id} href={`/admin/invoices/${i.id}`} className="block text-a-accent hover:underline">
                          {i.number}
                        </Link>
                      ))}
                    </Td>
                    <Td className="text-right tabular-nums">{npr(b.totalAmount)}</Td>
                    <Td className="text-right tabular-nums">{b.invoiceCount ? npr(b.invoiced) : <span className="text-xs text-a-muted">Not invoiced</span>}</Td>
                    <Td className="text-right tabular-nums">{npr(b.received)}</Td>
                    <Td className="text-right font-semibold text-a-warning tabular-nums">{npr(b.outstanding)}</Td>
                    <Td className="whitespace-nowrap">
                      {due ? <span className={late ? "font-medium text-a-danger" : undefined}>{fmtDate(due)}</span> : <span className="text-a-muted">—</span>}
                      {late && <span className="block text-xs text-a-danger">Overdue</span>}
                      {sent && <span className="block text-[11px] text-a-muted">Reminded {fmtDate(sent)}</span>}
                    </Td>
                    <Td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </Td>
                    <Td>
                      {canRecord && (
                        <div className="flex flex-col items-end gap-1.5">
                          <RecordPaymentButton
                            size="sm"
                            variant="secondary"
                            label="Record"
                            canAdjust={canAdjust}
                            canAttach={canAttach}
                            bookingId={b.bookingId}
                            customer={{
                              id: b.customerId,
                              name: b.customerName,
                              phone: c?.phone ?? null,
                              email: c?.email ?? null,
                              bookings: [{ ...b, invoices: bookingInvoices.filter((i) => i.amountPaid < i.total).map((i) => ({ id: i.id, number: i.number, status: i.status, due: i.total - i.amountPaid })) }],
                            }}
                          />
                          {reminder && <PaymentReminderButton id={b.bookingId} email={c?.email ?? null} due={reminder} />}
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Reminder log" description="Payment reminders emailed to customers (automatic ones are set in Settings → Automations)." bodyClassName="p-0">
        {log.length === 0 ? (
          <EmptyState compact icon={BellRing} title="No reminders yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sent</Th>
                <Th>To</Th>
                <Th>Type</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {log.slice(0, 25).map((r) => (
                <tr key={r.id}>
                  <Td className="text-xs whitespace-nowrap">{fmtDateTime(r.createdAt)}</Td>
                  <Td className="text-xs">{r.to}</Td>
                  <Td className="text-xs">{r.entityType === "payment-reminder" ? (r.entityId?.endsWith(":late") ? "Automatic · overdue" : "Automatic · due soon") : "Manual"}</Td>
                  <Td>
                    <Badge tone={r.status === "SENT" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>{r.status === "SENT" ? "Sent" : r.status === "FAILED" ? "Failed" : "Not sent — email off"}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ───────── Receipts ───────── */

export async function ReceiptsTab({ sp, canSend }: { sp: SP; canSend: boolean }) {
  const { page, pageSize, offset, q, str } = listParams(sp, 40);
  let query = adminDb.from("payment_ledger").select(LEDGER_COLS, { count: "exact" }).neq("status", "REVERSED").neq("status", "REFUNDED");
  if (str("from")) query = query.gte("paid_at", str("from")!);
  if (str("to")) query = query.lte("paid_at", str("to")!);
  if (q) {
    const t = pgrstValue(likeTerm(q));
    query = query.or(`number.ilike.${t},customer_name.ilike.${t},booking_number.ilike.${t}`);
  }
  const [{ rows, total }, adjustments] = await Promise.all([
    paged<LedgerRow>(query.order("paid_at", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + pageSize - 1)),
    many<{ id: string; number: string; kind: string; amount: number; adjustedOn: string; reason: string; paymentId: string; p: { number: string } }>(
      adminDb.from(tbl(schema.paymentAdjustments)).select("id,number,kind,amount,adjustedOn:adjusted_on,reason,paymentId:payment_id,p:payments!inner(number)").order("created_at", { ascending: false }).limit(15),
    ),
  ]);
  const emails = rows.length ? await many<{ id: string; email: string | null }>(adminDb.from(tbl(schema.customers)).select("id,email").in("id", [...new Set(rows.map((r) => r.customerId))])) : [];
  const emailOf = new Map(emails.map((e) => [e.id, e.email]));

  return (
    <div className="space-y-4">
      <Notice tone="info">A receipt exists for every payment received. Reversed and fully refunded payments have no valid receipt; partly refunded ones show the amount kept.</Notice>
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Receipt no., customer or booking" />
          <DateRangeFilter />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No receipts found" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Booking</Th>
                <Th className="text-right">Amount received</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-a-subtle/60">
                  <Td>
                    <Link href={`/admin/finance/payments/${p.id}`} className="font-medium hover:underline">
                      {p.number}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{fmtDate(p.paidAt)}</Td>
                  <Td>{p.customerName}</Td>
                  <Td className="text-xs">{p.bookingNumber ?? "—"}</Td>
                  <Td className="text-right font-medium tabular-nums">{npr(p.netAmount)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-3">
                      <ReceiptLink id={p.id} />
                      {canSend && <EmailReceiptButton id={p.id} email={emailOf.get(p.customerId) ?? null} />}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination basePath="/admin/finance" params={{ ...sp, tab: "receipts" }} page={page} pageSize={pageSize} total={total} />
      </Card>
      <Card title="Refunds & reversals" description="Corrections are separate numbered records; the original payments are kept unchanged." bodyClassName="p-0">
        {adjustments.length === 0 ? (
          <EmptyState compact title="None recorded" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Date</Th>
                <Th>Of payment</Th>
                <Th>Reason</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <span className="font-medium">{a.number}</span>
                    <span className="block text-xs text-a-muted">{a.kind === "REFUND" ? "Refund" : "Reversal"}</span>
                  </Td>
                  <Td className="whitespace-nowrap">{fmtDate(a.adjustedOn)}</Td>
                  <Td>
                    <Link href={`/admin/finance/payments/${a.paymentId}`} className="hover:underline">
                      {a.p.number}
                    </Link>
                  </Td>
                  <Td className="max-w-72 text-xs">{a.reason}</Td>
                  <Td className="text-right tabular-nums">−{npr(a.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
