/**
 * Phase 4 database tests — unified finance (migrations 00022–00023).
 *
 *   npx tsx scripts/test-db.ts                     (other terminal: throw-away Postgres)
 *   TEST_SERVER_URL=postgres://postgres:postgres@localhost:54339 npx tsx scripts/test-phase4.ts
 *
 * Creates its own database "timeless_p4" on that server: applies migrations up to 00021, writes
 * pre-Phase-4 financial records the way the old app did, applies 00022–00023 and checks that every
 * existing figure, number and link is unchanged. Then runs the Phase 4 scenarios on top.
 * Refuses to run against anything but localhost.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const server = process.env.TEST_SERVER_URL ?? "postgres://postgres:postgres@localhost:54339";
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(server)) {
  console.error("Refusing to run: TEST_SERVER_URL must be a local Postgres server (localhost), without a database name.");
  process.exit(1);
}
const DB = "timeless_p4";

let passed = 0;
const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}
async function failure(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

async function main() {
  const root = postgres(`${server}/postgres`, { max: 1, onnotice: () => {} });
  await root.unsafe(`drop database if exists ${DB} with (force)`);
  await root.unsafe(`create database ${DB}`);
  await root.end();

  const sql = postgres(`${server}/${DB}`, { max: 6, onnotice: () => {}, prepare: false });
  type Tx = postgres.TransactionSql;
  const asUser = <T>(userId: string, fn: (t: Tx) => Promise<T>): Promise<T> =>
    sql.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
      return fn(tx);
    }) as Promise<T>;

  await sql.unsafe(readFileSync(join("scripts", "sql", "local-supabase-shim.sql"), "utf8"));
  const dir = join("supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const apply = async (pred: (n: number) => boolean) => {
    for (const f of files) if (pred(Number(f.slice(0, 5)))) await sql.begin((tx) => tx.unsafe(readFileSync(join(dir, f), "utf8")));
  };
  await apply((n) => n <= 21);

  const user = async (key: string, role: string | null) => {
    const id = randomUUID();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${key}@p4.test`}, ${sql.json({ full_name: key })})`;
    if (role) await sql`insert into public.user_roles (user_id, role_id) select ${id}, id from public.roles where key = ${role}`;
    return id;
  };
  let n = 0;
  const customer = async (name: string) => (await sql`insert into public.customers (name, phone) values (${name}, ${`98${String(++n).padStart(8, "0")}`}) returning id`)[0].id as string;
  const booking = async (cust: string, total: number, deposit: number, status = "CONFIRMED") => {
    const [b] = await sql`insert into public.bookings (number, customer_id, status, total_amount, deposit_amount) values (${`BK-T-${++n}`}, ${cust}, ${status}, ${total}, ${deposit}) returning id`;
    await sql`insert into public.booking_items (booking_id, position, description, quantity, unit_price, amount) values (${b.id}, 0, 'Stage décor', 1, ${total}, ${total})`;
    await sql`insert into public.events (booking_id, customer_id, title, event_date, start_at, end_at) values (${b.id}, ${cust}, ${`Event ${n}`}, current_date + 30, now() + interval '30 days', now() + interval '31 days')`;
    return b.id as string;
  };

  /* ───────── G. Production data preservation (old app's records → migrate) ───────── */
  const lc = await customer("Legacy Client");
  const lb = await booking(lc, 150000, 30000);
  const [linv] = await sql`insert into public.invoices (number, booking_id, customer_id, status, subtotal, total, due_date) values ('INV-2025-001', ${lb}, ${lc}, 'SENT', 150000, 150000, current_date + 10) returning id`;
  await sql`insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount) values (${linv.id}, 'Stage décor', 1, 150000, 150000)`;
  await sql`insert into public.payments (number, booking_id, invoice_id, customer_id, amount, method, paid_at, reference) values
    ('RC-2025-001', ${lb}, ${linv.id}, ${lc}, 30000, 'CASH', current_date - 20, 'adv'),
    ('RC-2025-002', ${lb}, null, ${lc}, 20000, 'BANK_TRANSFER', current_date - 10, 'txn-2'),
    ('RC-2025-003', ${lb}, ${linv.id}, ${lc}, 10000, 'ONLINE', current_date - 5, 'dup')`;
  await sql`update public.payments set voided_at = now(), void_reason = 'Entered twice' where number = 'RC-2025-003'`;
  const snapshot = async () => ({
    payments: await sql`select id, number, booking_id, invoice_id, customer_id, amount, method, paid_at, reference, voided_at, void_reason from public.payments order by number`,
    invoices: await sql`select id, number, total, amount_paid, status, due_date from public.invoices order by number`,
    bookings: await sql`select id, number, customer_id, total_amount, amount_paid from public.bookings order by number`,
  });
  const before = await snapshot();
  await apply((n) => n >= 22);
  const after = await snapshot();
  expect("existing payments unchanged (ids, numbers, amounts, dates, links, voids)", JSON.stringify(before.payments) === JSON.stringify(after.payments));
  expect("existing invoices unchanged (totals, amount paid, status)", JSON.stringify(before.invoices) === JSON.stringify(after.invoices), JSON.stringify(after.invoices));
  expect("existing bookings unchanged (amount paid = 50,000)", JSON.stringify(before.bookings) === JSON.stringify(after.bookings) && after.bookings[0]!.amount_paid === 50000);
  const legacyAlloc = await sql`select a.amount, p.number from public.payment_allocations a join public.payments p on p.id = a.payment_id`;
  expect("backfill: one allocation for the invoice-linked valid payment only", legacyAlloc.length === 1 && legacyAlloc[0]!.number === "RC-2025-001" && legacyAlloc[0]!.amount === 30000);
  const types = await sql`select number, payment_type from public.payments order by number`;
  expect("backfill: payment that covered the advance classified ADVANCE, later one PAYMENT", types[0]!.payment_type === "ADVANCE" && types[1]!.payment_type === "PAYMENT");
  const [lbf] = await sql`select received, outstanding, unallocated, invoiced, payment_status from public.booking_finance where booking_id = ${lb}`;
  expect("legacy booking summary: received 50,000, outstanding 100,000, 20,000 not yet on the invoice", lbf.received === 50000 && lbf.outstanding === 100000 && lbf.unallocated === 20000 && lbf.invoiced === 150000, JSON.stringify(lbf));
  // Re-running the migration is harmless
  await sql.begin((tx) => tx.unsafe(readFileSync(join(dir, "00023_phase4_finance.sql"), "utf8")));
  const again = await snapshot();
  expect("migration is safe to re-run", JSON.stringify(after) === JSON.stringify(again) && (await sql`select count(*)::int c from public.payment_allocations`)[0]!.c === 1);

  const admin = await user("admin", "ADMIN");
  const accountant = await user("accountant", "ACCOUNTANT");
  const sales = await user("sales", "SALES");
  const eventMgr = await user("eventmgr", "EVENT_MANAGER");
  // A clerk who can record payments but not adjust them
  const [clerkRole] = await sql`insert into public.roles (key, name) values ('CLERK', 'Clerk') returning id`;
  await sql`insert into public.role_permissions (role_id, permission_key) values (${clerkRole.id}, 'payments.view'), (${clerkRole.id}, 'payments.create'), (${clerkRole.id}, 'bookings.view')`;
  const clerk = await user("clerk", null);
  await sql`insert into public.user_roles (user_id, role_id) values (${clerk}, ${clerkRole.id})`;

  const pay = (uid: string, a: Record<string, unknown>) =>
    asUser(uid, async (t) => {
      const [r] = await t`select public.record_payment(${(a.customer as string) ?? null}::uuid, ${(a.booking as string) ?? null}::uuid, ${(a.invoice as string) ?? null}::uuid,
        ${a.amount as number}, ${(a.method as string) ?? "CASH"}::public.payment_method, ${(a.date as string) ?? new Date().toISOString().slice(0, 10)}::date,
        ${(a.type as string) ?? "PAYMENT"}, ${(a.reference as string) ?? null}, ${(a.receivedBy as string) ?? null}, null, ${(a.key as string) ?? null}, ${(a.over as boolean) ?? false}) as r`;
      return r.r as Record<string, unknown>;
    });
  const bf = async (b: string) => (await sql`select * from public.booking_finance where booking_id = ${b}`)[0]!;

  /* ───────── A. Advance before invoice ───────── */
  const ca = await customer("Asha Rai");
  const ba = await booking(ca, 150000, 30000, "PENDING");
  const adv = await pay(accountant, { booking: ba, amount: 30000, type: "ADVANCE", method: "QR", reference: "FP-123", receivedBy: "Office" });
  expect("A: advance recorded without an invoice", !!adv.paymentId && adv.invoiceId === null && adv.existed === false);
  expect("A: pending booking confirmed once the advance is covered", adv.autoConfirmed === true);
  let fa = await bf(ba);
  expect("A: booking received 30,000, outstanding 120,000, partially paid", fa.received === 30000 && fa.outstanding === 120000 && fa.payment_status === "PARTIALLY_PAID" && fa.advance_received === 30000, JSON.stringify(fa));
  const [la] = await sql`select customer_id, booking_id, event_id, allocation_state, payment_type from public.payment_ledger where id = ${adv.paymentId as string}`;
  expect("A: payment linked to customer, booking and event", la.customer_id === ca && la.booking_id === ba && !!la.event_id && la.allocation_state === "BOOKING");
  const [cfa] = await sql`select received, outstanding, advance_received from public.customer_finance where customer_id = ${ca}`;
  expect("A: customer summary shows it", cfa.received === 30000 && cfa.outstanding === 120000 && cfa.advance_received === 30000);
  const [inv] = await asUser(accountant, (t) => t`select public.create_booking_invoice(${ba}::uuid, null, null, true) as r`);
  const ir = inv.r as { invoiceId: string; applied: number; due: number };
  expect("A: invoice recognises the advance (applied 30,000, due 120,000)", ir.applied === 30000 && ir.due === 120000, JSON.stringify(ir));
  const [ia] = await sql`select total, amount_paid, prior_payments, status from public.invoices where id = ${ir.invoiceId}`;
  expect("A: invoice total 150,000, paid 30,000, previously received 30,000, partially paid", ia.total === 150000 && ia.amount_paid === 30000 && ia.prior_payments === 30000 && ia.status === "PARTIALLY_PAID", JSON.stringify(ia));
  expect("A: no duplicate payment", (await sql`select count(*)::int c from public.payments where booking_id = ${ba}`)[0]!.c === 1);
  const [orig] = await sql`select paid_at, reference from public.payments where id = ${adv.paymentId as string}`;
  expect("A: advance keeps its date and reference", orig.reference === "FP-123");
  const dup = await failure(() => asUser(accountant, (t) => t`select public.create_booking_invoice(${ba}::uuid) as r`));
  expect("A: only one open invoice per booking", !!dup && /already open/.test(dup), String(dup));

  /* ───────── B. Multiple payments ───────── */
  const p2 = await pay(accountant, { booking: ba, amount: 50000 });
  await pay(accountant, { booking: ba, amount: 40000 });
  const p4 = await pay(accountant, { booking: ba, amount: 30000 });
  expect("B: later payments applied to the open invoice", p2.invoiceId === ir.invoiceId && p4.invoiceStatus === "PAID");
  fa = await bf(ba);
  expect("B: received 150,000, outstanding 0, paid", fa.received === 150000 && fa.outstanding === 0 && fa.payment_status === "PAID", JSON.stringify(fa));
  const nums = await sql`select number from public.payments where booking_id = ${ba}`;
  expect("B: every payment has its own receipt number", new Set(nums.map((x) => x.number)).size === 4);

  /* ───────── Idempotency, validation, overpayment ───────── */
  const cb = await customer("Bina KC");
  const bb = await booking(cb, 100000, 20000);
  const key = randomUUID();
  const k1 = await pay(accountant, { booking: bb, amount: 20000, key });
  const k2 = await pay(accountant, { booking: bb, amount: 20000, key });
  expect("duplicate submission returns the first payment", k2.existed === true && k2.paymentId === k1.paymentId);
  expect("…and records nothing twice", (await bf(bb)).received === 20000);
  expect("zero amount refused", /above zero/.test((await failure(() => pay(accountant, { booking: bb, amount: 0 }))) ?? ""));
  expect("future date refused", /future/.test((await failure(() => pay(accountant, { booking: bb, amount: 10, date: "2099-01-01" }))) ?? ""));
  const otherCust = await customer("Other");
  expect("booking of another customer refused", /different customer/.test((await failure(() => pay(accountant, { customer: otherCust, booking: bb, amount: 10 }))) ?? ""));
  const over = await failure(() => pay(accountant, { booking: bb, amount: 90000 }));
  expect("overpayment needs confirmation (shows the excess)", !!over && /10,000 more/.test(over), String(over));
  const clerkOver = await failure(() => pay(clerk, { booking: bb, amount: 90000, over: true }));
  expect("overpayment needs payments.adjust", !!clerkOver && /adjust/.test(clerkOver), String(clerkOver));
  const ov = await pay(accountant, { booking: bb, amount: 90000, over: true });
  const fb = await bf(bb);
  expect("confirmed overpayment recorded in full; extra kept as credit; booking value unchanged", ov.excess === 10000 && fb.received === 110000 && fb.credit === 10000 && fb.total_amount === 100000 && fb.payment_status === "OVERPAID", JSON.stringify(fb));

  /* ───────── Customer-level (unassigned) payment ───────── */
  const cu = await customer("Chandra");
  expect("clerk can't keep a payment unassigned", /booking/.test((await failure(() => pay(clerk, { customer: cu, amount: 5000 }))) ?? ""));
  const un = await pay(accountant, { customer: cu, amount: 5000 });
  const [cfu] = await sql`select received, credit, unallocated from public.customer_finance where customer_id = ${cu}`;
  expect("unassigned payment held as customer credit", cfu.received === 5000 && cfu.credit === 5000 && cfu.unallocated === 5000, JSON.stringify(cfu));
  const bu = await booking(cu, 40000, 10000);
  await asUser(accountant, (t) => t`select public.assign_payment_booking(${un.paymentId as string}::uuid, ${bu}::uuid)`);
  expect("assigned later to the customer's booking", (await bf(bu)).received === 5000);
  expect("can't be moved to another booking afterwards", /already belongs/.test((await failure(() => asUser(accountant, (t) => t`select public.assign_payment_booking(${un.paymentId as string}::uuid, ${bb}::uuid)`))) ?? ""));

  /* ───────── D. Allocation ───────── */
  const cd = await customer("Deepa");
  const bd = await booking(cd, 80000, 20000);
  const [dinv] = await asUser(accountant, (t) => t`select public.create_booking_invoice(${bd}::uuid) as r`); // draft, nothing paid yet
  const did = (dinv.r as { invoiceId: string }).invoiceId;
  const dp = await pay(accountant, { booking: bd, amount: 20000, type: "ADVANCE" });
  expect("D: draft invoice isn't paid automatically", dp.invoiceId === null);
  await sql`update public.invoices set status = 'SENT' where id = ${did}`;
  const al1 = await asUser(accountant, (t) => t`select public.allocate_payment(${dp.paymentId as string}::uuid, ${did}::uuid) as r`);
  const al2 = await asUser(accountant, (t) => t`select public.allocate_payment(${dp.paymentId as string}::uuid, ${did}::uuid) as r`);
  expect("D: retrying an allocation doesn't allocate twice", (al2[0]!.r as { existed: boolean }).existed && (al1[0]!.r as { amount: number }).amount === 20000);
  const [di] = await sql`select amount_paid, status from public.invoices where id = ${did}`;
  expect("D: invoice balance 60,000 after allocation", di.amount_paid === 20000 && di.status === "PARTIALLY_PAID");
  const both = await Promise.allSettled([
    asUser(accountant, (t) => t`insert into public.payment_allocations (payment_id, invoice_id, amount) values (${dp.paymentId as string}, ${did}, 1)`),
    asUser(accountant, (t) => t`insert into public.payment_allocations (payment_id, invoice_id, amount) values (${dp.paymentId as string}, ${did}, 1)`),
  ]);
  expect("D: no second active allocation of the same pair (constraint)", both.every((r) => r.status === "rejected"));
  expect("D: can't allocate to another customer's invoice", /different customers|different booking/.test((await failure(() => asUser(accountant, (t) => t`select public.allocate_payment(${dp.paymentId as string}::uuid, ${ir.invoiceId}::uuid, 1)`))) ?? ""));

  /* ───────── E. Refund and reversal ───────── */
  const ce = await customer("Esha");
  const be = await booking(ce, 60000, 10000);
  const e1 = await pay(accountant, { booking: be, amount: 10000, type: "ADVANCE" });
  const e2 = await pay(accountant, { booking: be, amount: 20000 });
  const [einv] = await asUser(accountant, (t) => t`select public.create_booking_invoice(${be}::uuid, null, null, true) as r`);
  const eid = (einv.r as { invoiceId: string }).invoiceId;
  expect("E: clerk can't reverse", /permission/.test((await failure(() => asUser(clerk, (t) => t`select public.reverse_payment(${e2.paymentId as string}::uuid, 'x')`))) ?? ""));
  const [rv] = await asUser(accountant, (t) => t`select public.reverse_payment(${e2.paymentId as string}::uuid, 'Bank transfer bounced') as r`);
  expect("E: reversal numbered RV-…", /^RV-\d{4}-\d{3}$/.test((rv.r as { number: string }).number));
  const [re] = await sql`select amount, voided_at, void_reason, status, net_amount from public.payment_ledger where id = ${e2.paymentId as string}`;
  expect("E: original payment kept, marked reversed, amount unchanged", re.amount === 20000 && !!re.voided_at && re.status === "REVERSED" && re.net_amount === 0);
  expect("E: booking and invoice balances updated", (await bf(be)).received === 10000 && (await sql`select amount_paid from public.invoices where id = ${eid}`)[0]!.amount_paid === 10000);
  const rkey = randomUUID();
  const refund = (amt: number) => asUser(accountant, (t) => t`select public.refund_payment(${e1.paymentId as string}::uuid, ${amt}, current_date, 'CASH', 'Service reduced', null, ${rkey}) as r`);
  const [rf] = await refund(4000);
  const [rf2] = await refund(4000);
  expect("E: refund numbered RF-… and retry-safe", /^RF-/.test((rf.r as { number: string }).number) && (rf2.r as { existed: boolean }).existed);
  const [ee] = await sql`select net_amount, refunded, allocated, status from public.payment_ledger where id = ${e1.paymentId as string}`;
  expect("E: partial refund reduces net and the invoice allocation", ee.net_amount === 6000 && ee.refunded === 4000 && ee.allocated === 6000 && ee.status === "PARTIALLY_REFUNDED", JSON.stringify(ee));
  const fe = await bf(be);
  expect("E: booking received net of refund 6,000, outstanding 54,000", fe.received === 6000 && fe.outstanding === 54000 && fe.refunded === 4000, JSON.stringify(fe));
  expect("E: invoice paid follows (6,000)", (await sql`select amount_paid from public.invoices where id = ${eid}`)[0]!.amount_paid === 6000);
  expect("E: can't refund more than remains", /can still be refunded/.test((await failure(() => asUser(accountant, (t) => t`select public.refund_payment(${e1.paymentId as string}::uuid, 7000, current_date, 'CASH', 'x')`))) ?? ""));
  expect("E: allocation history kept (reversed + reduced)", (await sql`select count(*)::int c from public.payment_allocations where payment_id = ${e1.paymentId as string}`)[0]!.c === 2);

  /* ───────── Integrity guards ───────── */
  expect("payment amount can't be edited", /can't be edited/.test((await failure(() => sql`update public.payments set amount = 1 where id = ${e1.paymentId as string}`)) ?? ""));
  expect("payments can't be deleted", /never deleted/.test((await failure(() => sql`delete from public.payments where id = ${e1.paymentId as string}`)) ?? ""));
  expect("reversal can't be undone", /stays reversed/.test((await failure(() => sql`update public.payments set voided_at = null where id = ${e2.paymentId as string}`)) ?? ""));
  expect("issued invoice amounts locked", /issued/.test((await failure(() => sql`update public.invoices set total = 1 where id = ${eid}`)) ?? ""));
  expect("issued invoice lines locked", /issued/.test((await failure(() => sql`insert into public.invoice_items (invoice_id, description, amount) values (${eid}, 'x', 1)`)) ?? ""));
  expect("invoices can't be deleted", /never deleted/.test((await failure(() => sql`delete from public.invoices where id = ${eid}`)) ?? ""));
  expect("refund records are permanent", /permanent/.test((await failure(() => sql`update public.payment_adjustments set amount = 1`)) ?? ""));

  /* ───────── Revision & cancellation keep the money ───────── */
  const [rev] = await asUser(accountant, (t) => t`select public.create_booking_invoice(${be}::uuid, null, 'corrected', true, ${eid}::uuid, 'Wrong due date') as r`);
  const rr = rev.r as { invoiceId: string; applied: number };
  const [old] = await sql`select status, cancel_reason from public.invoices where id = ${eid}`;
  expect("revision cancels the original with its reason and re-applies the payments", old.status === "CANCELLED" && old.cancel_reason === "Wrong due date" && rr.applied === 6000);
  expect("revision links to the original", (await sql`select revision_of from public.invoices where id = ${rr.invoiceId}`)[0]!.revision_of === eid);
  await asUser(accountant, (t) => t`select public.cancel_invoice(${rr.invoiceId}::uuid, 'Client asked to wait')`);
  const fe2 = await bf(be);
  expect("cancelling an invoice leaves the payments on the booking", fe2.received === 6000 && fe2.unallocated === 6000 && fe2.invoiced === 0, JSON.stringify(fe2));

  /* ───────── Concurrency ───────── */
  const cc = await customer("Gita");
  const bc = await booking(cc, 50000, 10000);
  const race = await Promise.allSettled([pay(accountant, { booking: bc, amount: 50000 }), pay(admin, { booking: bc, amount: 50000 })]);
  expect("two simultaneous full payments: one accepted, the other refused as an overpayment", race.filter((r) => r.status === "fulfilled").length === 1 && (await bf(bc)).received === 50000);

  /* ───────── RLS ───────── */
  expect("sales can't record payments", /permission/.test((await failure(() => pay(sales, { booking: bc, amount: 1 }))) ?? ""));
  const seen = await asUser(eventMgr, (t) => t`select count(*)::int c from public.payment_ledger`);
  expect("event manager without payments.view sees no payments", seen[0]!.c === 0);
  const seenB = await asUser(sales, (t) => t`select count(*)::int c from public.payment_adjustments`);
  expect("sales sees no refunds/reversals", seenB[0]!.c === 0);
  const direct = await failure(() => asUser(sales, (t) => t`insert into public.payment_allocations (payment_id, invoice_id, amount) values (${dp.paymentId as string}, ${did}, 1)`));
  expect("sales can't allocate directly", !!direct);
  const anon = await failure(() => sql.begin(async (t) => { await t.unsafe("set local role anon"); await t`select count(*) from public.booking_finance`; }));
  expect("anonymous visitors can't read finance views", !!anon);
  const acct = await asUser(accountant, (t) => t`select count(*)::int c from public.payment_ledger`);
  expect("accountant sees the payment ledger", acct[0]!.c > 5);

  /* ───────── F. Expenses ───────── */
  const [cat] = await sql`select id from public.expense_categories where slug = 'flowers'`;
  const [ex] = await asUser(accountant, (t) => t`insert into public.expenses (category_id, description, amount, date, booking_id, payee) values (${cat.id}, 'Roses', 7000, current_date, ${be}, 'Flower market') returning event_id, booking_id`);
  const [evOfBe] = await sql`select id from public.events where booking_id = ${be}`;
  expect("F: booking expense gets its event", ex.event_id === evOfBe.id);
  expect("F: expenses don't count as payments", (await bf(be)).received === 6000);
  const general = await asUser(accountant, (t) => t`insert into public.expenses (category_id, description, amount, date) values (${cat.id}, 'Office flowers', 500, current_date) returning booking_id`);
  expect("F: general expense needs no booking", general[0]!.booking_id === null);
  expect("F: event of another booking refused", /different booking/.test((await failure(() => sql`insert into public.expenses (category_id, description, amount, date, booking_id, event_id) values (${cat.id}, 'x', 1, current_date, ${ba}, ${evOfBe.id})`)) ?? ""));

  await sql.end();
  console.log(`Phase 4 tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
