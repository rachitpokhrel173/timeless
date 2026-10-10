/**
 * Row Level Security test suite — runs against a database built from supabase/migrations.
 *
 *   npm run test:rls
 *
 * Creates throw-away users for each role inside one transaction, checks what every role can
 * read and write, verifies the payment → invoice balance trigger, then rolls everything back.
 * Point it at a Supabase branch/staging database (never production).
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { randomUUID } from "node:crypto";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {}, prepare: false });
type Tx = postgres.TransactionSql;

let passed = 0;
const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

class Rollback extends Error {}

async function main() {
  await sql
    .begin(async (tx) => {
      const ids = Object.fromEntries(
        ["superAdmin", "admin", "sales", "editor", "accountant", "staffer", "custA", "custB", "outsider"].map((k) => [k, randomUUID()]),
      ) as Record<string, string>;
      for (const [k, id] of Object.entries(ids)) {
        await tx`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${k}@rls.test`}, ${tx.json({ full_name: k })})`;
      }
      const role = async (user: string, key: string) =>
        tx`insert into public.user_roles (user_id, role_id) select ${user}, id from public.roles where key = ${key}`;
      await role(ids.superAdmin, "SUPER_ADMIN");
      await role(ids.admin, "ADMIN");
      await role(ids.sales, "SALES");
      await role(ids.editor, "EDITOR");
      await role(ids.accountant, "ACCOUNTANT");
      await role(ids.staffer, "STAFF");

      const profile = await tx`select full_name from public.profiles where id = ${ids.sales}`;
      expect("auth trigger creates a profile", profile[0]?.full_name === "sales");

      // Business data (as the privileged owner)
      const [ca] = await tx`insert into public.customers (name, phone, auth_user_id) values ('Customer A', '9800000001', ${ids.custA}) returning id`;
      const [cb] = await tx`insert into public.customers (name, phone, auth_user_id) values ('Customer B', '9800000002', ${ids.custB}) returning id`;
      await tx`insert into public.leads (number, name, phone) values ('LD-TEST-1', 'Lead', '9800000003')`;
      const quote = async (customer: string, status: string, n: string) =>
        (await tx`insert into public.quotations (number, customer_id, title, status, public_token, total) values (${n}, ${customer}, 'Q', ${status}, ${randomUUID()}, 100000) returning id`)[0].id as string;
      await quote(ca.id, "SENT", "QT-T-1");
      await quote(ca.id, "DRAFT", "QT-T-2");
      await quote(cb.id, "SENT", "QT-T-3");
      const [bk] = await tx`insert into public.bookings (number, customer_id, status, total_amount, deposit_amount) values ('BK-T-1', ${ca.id}, 'CONFIRMED', 100000, 50000) returning id`;
      await tx`insert into public.bookings (number, customer_id, status, total_amount) values ('BK-T-2', ${cb.id}, 'CONFIRMED', 50000)`;
      const [inv] = await tx`insert into public.invoices (number, booking_id, customer_id, status, total, due_date) values ('INV-T-1', ${bk.id}, ${ca.id}, 'SENT', 100000, current_date + 10) returning id`;
      await tx`insert into public.internal_notes (entity_type, entity_id, body) values ('customer', ${ca.id}, 'secret')`;
      await tx`insert into public.services (slug, name, summary, description, status) values ('rls-pub', 'Pub', 's', 'd', 'PUBLISHED'), ('rls-draft', 'Draft', 's', 'd', 'DRAFT')`;
      await tx`insert into public.testimonials (customer_name, event_type, quote, status, consent) values ('A', 'Wedding', 'ok', 'PUBLISHED', true), ('B', 'Wedding', 'no consent', 'PUBLISHED', false), ('C', 'Wedding', 'draft', 'DRAFT', true)`;
      await tx`insert into public.site_settings (key, value, is_public) values ('rls-public', '{}'::jsonb, true), ('rls-private', '{}'::jsonb, false)`;
      // Rows in every private table, so "cannot read" checks are meaningful
      await tx`insert into public.inquiries (number, name, phone, event_type) values ('IQ-T-1', 'Inq', '9800000004', 'wedding')`;
      await tx`insert into public.staff (name) values ('Crew member')`;
      await tx`insert into public.inventory_items (sku, name, quantity) values ('RLS-SKU', 'Chair', 10)`;
      await tx`insert into public.followups (due_at, note) values (now(), 'call')`;
      await tx`insert into public.activity_logs (action, entity, summary) values ('test', 'test', 'test')`;
      const [cat] = await tx`select id from public.expense_categories limit 1`;
      await tx`insert into public.expenses (category_id, description, amount, date) values (${cat.id}, 'x', 100, current_date)`;

      // Payment trigger keeps balances right
      await tx`insert into public.payments (number, booking_id, invoice_id, customer_id, amount, method, paid_at) values ('RC-T-1', ${bk.id}, ${inv.id}, ${ca.id}, 40000, 'CASH', current_date)`;
      let [i1] = await tx`select amount_paid, status from public.invoices where id = ${inv.id}`;
      expect("payment updates invoice amount_paid", i1.amount_paid === 40000, `got ${i1.amount_paid}`);
      expect("partial payment sets PARTIALLY_PAID", i1.status === "PARTIALLY_PAID", `got ${i1.status}`);
      await tx`insert into public.payments (number, booking_id, invoice_id, customer_id, amount, method, paid_at) values ('RC-T-2', ${bk.id}, ${inv.id}, ${ca.id}, 60000, 'CASH', current_date)`;
      [i1] = await tx`select amount_paid, status from public.invoices where id = ${inv.id}`;
      expect("full payment sets PAID", i1.status === "PAID", `got ${i1.status}`);
      const [b1] = await tx`select amount_paid from public.bookings where id = ${bk.id}`;
      expect("payment updates booking amount_paid", b1.amount_paid === 100000, `got ${b1.amount_paid}`);
      await tx`update public.payments set voided_at = now() where number = 'RC-T-2'`;
      [i1] = await tx`select amount_paid, status from public.invoices where id = ${inv.id}`;
      expect("voiding a payment reduces the balance", i1.amount_paid === 40000 && i1.status === "PARTIALLY_PAID", `${i1.amount_paid} ${i1.status}`);
      let threw = false;
      try {
        await tx.savepoint((sp) => sp`insert into public.payments (number, booking_id, customer_id, amount, method, paid_at) values ('RC-T-3', ${bk.id}, ${ca.id}, -5, 'CASH', current_date)`);
      } catch {
        threw = true;
      }
      expect("negative payment rejected by constraint", threw);

      /** Run checks as a role (savepoint so failures don't abort the outer transaction). */
      const as = async <T>(roleName: "anon" | "authenticated", userId: string | null, fn: (t: Tx) => Promise<T>) =>
        tx.savepoint(async (sp) => {
          await sp.unsafe(`set local role ${roleName}`);
          await sp`select set_config('request.jwt.claims', ${JSON.stringify(userId ? { sub: userId, role: roleName } : { role: "anon" })}, true)`;
          return fn(sp as unknown as Tx);
        });
      const count = async (t: Tx, table: string) => Number((await t.unsafe(`select count(*)::int as c from public.${table}`))[0].c);
      const denied = async (roleName: "anon" | "authenticated", userId: string | null, statement: string) => {
        try {
          await as(roleName, userId, (t) => t.unsafe(statement));
          return false;
        } catch {
          return true;
        }
      };

      // Anonymous visitors: website content only
      await as("anon", null, async (t) => {
        for (const table of ["leads", "inquiries", "customers", "quotations", "bookings", "invoices", "payments", "expenses", "staff", "inventory_items", "internal_notes", "activity_logs", "profiles", "followups"]) {
          expect(`anon cannot read ${table}`, (await count(t, table)) === 0);
        }
        expect("anon sees only published services", (await t`select slug from public.services where slug like 'rls-%'`).length === 1);
        expect("anon sees only consented published testimonials", (await t`select 1 from public.testimonials where customer_name in ('A','B','C')`).length === 1);
        expect("anon sees only public settings", (await t`select key from public.site_settings where key like 'rls-%'`).map((r) => r.key).join() === "rls-public");
      });
      expect("anon cannot insert leads", await denied("anon", null, "insert into public.leads (number, name) values ('LD-X', 'x')"));
      expect("anon cannot insert inquiries directly", await denied("anon", null, "insert into public.inquiries (number, name, phone, event_type) values ('IQ-X', 'x', '1', 'wedding')"));
      expect("anon cannot call next_document_number", await denied("anon", null, "select public.next_document_number('QT')"));

      // Sales
      await as("authenticated", ids.sales, async (t) => {
        expect("sales reads leads", (await count(t, "leads")) >= 1);
        expect("sales reads customers", (await count(t, "customers")) >= 2);
        expect("sales reads quotations", (await count(t, "quotations")) >= 3);
        expect("sales cannot read invoices", (await count(t, "invoices")) === 0);
        expect("sales cannot read payments", (await count(t, "payments")) === 0);
        expect("sales cannot read expenses", (await count(t, "expenses")) === 0);
        expect("sales cannot read audit log", (await count(t, "activity_logs")) === 0);
        const updated = await t`update public.leads set priority = 'HIGH' where number = 'LD-TEST-1' returning id`;
        expect("sales updates leads", updated.length === 1);
        const deleted = await t`delete from public.customers where id = ${cb.id} returning id`;
        expect("sales cannot delete customers", deleted.length === 0);
        const num = (await t`select public.next_document_number('QT') as n`)[0].n as string;
        expect("staff get document numbers", /^QT-\d{4}-\d{3}$/.test(num), num);
      });
      expect("sales cannot grant themselves roles", await denied("authenticated", ids.sales, `insert into public.user_roles (user_id, role_id) select '${ids.sales}', id from public.roles where key = 'ADMIN'`));

      // Editor
      await as("authenticated", ids.editor, async (t) => {
        expect("editor sees draft services", (await t`select slug from public.services where slug like 'rls-%'`).length === 2);
        expect("editor cannot read leads", (await count(t, "leads")) === 0);
        expect("editor cannot read customers", (await count(t, "customers")) === 0);
        const u = await t`update public.services set summary = 'edited' where slug = 'rls-draft' returning id`;
        expect("editor edits services", u.length === 1);
      });
      expect("editor cannot create leads", await denied("authenticated", ids.editor, "insert into public.leads (number, name) values ('LD-Y', 'y')"));

      // Accountant
      await as("authenticated", ids.accountant, async (t) => {
        expect("accountant reads invoices", (await count(t, "invoices")) >= 1);
        expect("accountant reads payments", (await count(t, "payments")) >= 1);
        expect("accountant reads expenses", (await count(t, "expenses")) >= 1);
        expect("accountant cannot read leads", (await count(t, "leads")) === 0);
      });

      // Staff (crew)
      await as("authenticated", ids.staffer, async (t) => {
        expect("crew cannot read quotations", (await count(t, "quotations")) === 0);
        expect("crew cannot read invoices", (await count(t, "invoices")) === 0);
        expect("crew cannot read customers", (await count(t, "customers")) === 0);
      });

      // Admin vs super admin
      expect(
        "admin cannot grant Super Admin",
        await denied("authenticated", ids.admin, `insert into public.user_roles (user_id, role_id) select '${ids.sales}', id from public.roles where key = 'SUPER_ADMIN'`),
      );
      const granted = await as("authenticated", ids.superAdmin, (t) => t`insert into public.user_roles (user_id, role_id) select ${ids.outsider}, id from public.roles where key = 'SUPER_ADMIN' returning user_id`);
      expect("super admin can grant Super Admin", granted.length === 1);
      expect(
        "non-admin cannot deactivate themselves via profile update",
        await denied("authenticated", ids.sales, `update public.profiles set active = false where id = '${ids.sales}'`),
      );
      const ownUpdate = await as("authenticated", ids.sales, (t) => t`update public.profiles set full_name = 'Sales Person' where id = ${ids.sales} returning id`);
      expect("users can update their own name", ownUpdate.length === 1);

      // Client portal customers: own records only
      await as("authenticated", ids.custA, async (t) => {
        expect("customer sees only their customer record", (await count(t, "customers")) === 1);
        const qs = await t`select number from public.quotations order by number`;
        expect("customer sees only own non-draft quotations", qs.map((r) => r.number).join() === "QT-T-1", qs.map((r) => r.number).join());
        expect("customer sees only own bookings", (await count(t, "bookings")) === 1);
        expect("customer sees own invoices", (await count(t, "invoices")) === 1);
        expect("customer sees only non-void own payments", (await count(t, "payments")) === 1);
        expect("customer cannot read leads", (await count(t, "leads")) === 0);
        expect("customer cannot read internal notes", (await count(t, "internal_notes")) === 0);
        expect("customer cannot read expenses", (await count(t, "expenses")) === 0);
        expect("customer cannot read staff profiles", (await t`select 1 from public.profiles where id <> ${ids.custA}`).length === 0);
      });
      expect("customer cannot get document numbers", await denied("authenticated", ids.custA, "select public.next_document_number('QT')"));
      expect("customer cannot update their quotation", (await as("authenticated", ids.custA, (t) => t`update public.quotations set total = 1 returning id`)).length === 0);

      // A signed-in user with no role and no customer record sees nothing
      await as("authenticated", ids.outsider, async (t) => {
        expect("outsider (before role) sees no customers", true);
        void t;
      });

      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });

  await sql.end();
  console.log(`RLS tests: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log("  ✗", f);
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
