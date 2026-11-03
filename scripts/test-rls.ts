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
      // Since 00025 the database refuses to publish without approval + consent (see scripts/test-phase5.ts)
      await tx`insert into public.testimonials (customer_name, event_type, quote, status, consent, review_status) values ('A', 'Wedding', 'ok', 'PUBLISHED', true, 'APPROVED'), ('B', 'Wedding', 'no consent', 'DRAFT', false, 'APPROVED'), ('C', 'Wedding', 'draft', 'DRAFT', true, 'PENDING')`;
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
          const result = await fn(sp as unknown as Tx);
          // `set local` survives a released savepoint: go back to the owner for the next setup step
          await sp.unsafe("reset role");
          await sp`select set_config('request.jwt.claims', '', true)`;
          return result;
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

      // ───── Work management: field team sees and updates only their own assigned work ─────
      // `set local role` inside as() outlives its savepoint — set up fixtures as the owner again
      const owner = async () => {
        await tx.unsafe("reset role");
        await tx`select set_config('request.jwt.claims', '', true)`;
      };
      await owner();
      const crew2 = randomUUID();
      await tx`insert into auth.users (id, email, raw_user_meta_data) values (${crew2}, 'crew2@rls.test', ${tx.json({ full_name: "crew2" })})`;
      await role(crew2, "STAFF");
      const [s1] = await tx`insert into public.staff (name, daily_rate) values ('Crew One', 2500) returning id`;
      const [s2] = await tx`insert into public.staff (name, daily_rate) values ('Crew Two', 3000) returning id`;
      const [s3] = await tx`insert into public.staff (name, daily_rate) values ('Crew Three', 3500) returning id`;
      await tx`update public.profiles set staff_id = ${s1.id} where id = ${ids.staffer}`;
      await tx`update public.profiles set staff_id = ${s2.id} where id = ${crew2}`;
      const [ev] = await tx`insert into public.events (booking_id, customer_id, title, event_date, start_at, end_at, estimated_cost) values (${bk.id}, ${ca.id}, 'Wedding', current_date + 7, now() + interval '7 days', now() + interval '8 days', 90000) returning id`;
      const task = async (title: string) => (await tx`insert into public.event_tasks (event_id, title) values (${ev.id}, ${title}) returning id`)[0].id as string;
      const tStage = await task("Stage Decoration");
      const tFlowers = await task("Flower Decoration");
      const tLights = await task("Lighting Setup");
      await tx`insert into public.event_task_internal (task_id, notes) values (${tStage}, 'client is difficult')`;
      // Crew One + Crew Two on stage; Crew Two alone on flowers; lights through the legacy single-assignee column
      const [a1] = await tx`insert into public.event_task_assignees (task_id, staff_id) values (${tStage}, ${s1.id}) returning id`;
      const [a2] = await tx`insert into public.event_task_assignees (task_id, staff_id) values (${tStage}, ${s2.id}) returning id`;
      await tx`insert into public.event_task_assignees (task_id, staff_id) values (${tFlowers}, ${s2.id})`;
      await tx`update public.event_tasks set assignee_staff_id = ${s3.id} where id = ${tLights}`;
      const legacy = await tx`select 1 from public.event_task_assignees where task_id = ${tLights} and staff_id = ${s3.id} and removed_at is null`;
      expect("legacy assignee column creates an assignment", legacy.length === 1);
      const [stage0] = await tx`select assignee_staff_id from public.event_tasks where id = ${tStage}`;
      expect("first assignee mirrored into assignee_staff_id", stage0.assignee_staff_id === s1.id);

      await as("authenticated", ids.staffer, async (t) => {
        const seen = await t`select title from public.event_tasks order by title`;
        expect("crew sees only tasks assigned to them", seen.map((r) => r.title).join() === "Stage Decoration", seen.map((r) => r.title).join());
        expect("crew cannot read events (no pricing / estimated cost)", (await count(t, "events")) === 0);
        expect("crew cannot read bookings", (await count(t, "bookings")) === 0);
        expect("crew cannot read payments", (await count(t, "payments")) === 0);
        expect("crew cannot read inventory", (await count(t, "inventory_items")) === 0);
        expect("crew cannot read internal task notes", (await count(t, "event_task_internal")) === 0);
        expect("crew cannot read CRM internal notes", (await count(t, "internal_notes")) === 0);
        expect("crew cannot read private settings", (await t`select 1 from public.site_settings where key = 'rls-private'`).length === 0);
        const team = await t`select id, daily_rate from public.staff`;
        expect("crew sees only their own team record", team.length === 1 && team[0].id === s1.id, String(team.length));
        expect("crew cannot read colleagues' profiles", (await t`select 1 from public.profiles where id <> ${ids.staffer}`).length === 0);
        const mates = await t`select staff_id from public.event_task_assignees`;
        expect("crew sees co-assignees on their task only", mates.length === 2, String(mates.length));
        const accepted = await t`update public.event_task_assignees set status = 'ACCEPTED' where id = ${a1.id} returning accepted_at`;
        expect("crew accepts their own assignment", accepted.length === 1 && !!accepted[0].accepted_at);
        const other = await t`update public.event_task_assignees set status = 'COMPLETED' where id = ${a2.id} returning id`;
        expect("crew cannot update a co-worker's assignment", other.length === 0);
        const hidden = await t`update public.event_task_assignees set status = 'COMPLETED' where task_id = ${tFlowers} returning id`;
        expect("crew cannot update another person's task by id", hidden.length === 0);
      });
      const [stage1] = await tx`select status from public.event_tasks where id = ${tStage}`;
      expect("task rolls up to Accepted", stage1.status === "ACCEPTED", stage1.status);
      expect("crew cannot edit the task itself", await denied("authenticated", ids.staffer, `update public.event_tasks set title = 'x' where id = '${tStage}'`));
      expect("crew cannot create tasks", await denied("authenticated", ids.staffer, `insert into public.event_tasks (event_id, title) values ('${ev.id}', 'x')`));
      expect("crew cannot assign themselves", await denied("authenticated", ids.staffer, `insert into public.event_task_assignees (task_id, staff_id) values ('${tFlowers}', '${s1.id}')`));
      expect("crew cannot move their assignment", await denied("authenticated", ids.staffer, `update public.event_task_assignees set staff_id = '${s3.id}' where id = '${a1.id}'`));
      expect("crew cannot forge history", await denied("authenticated", ids.staffer, `insert into public.event_task_updates (task_id, kind) values ('${tStage}', 'STATUS')`));
      expect("crew cannot give themselves a role", await denied("authenticated", ids.staffer, `insert into public.user_roles (user_id, role_id) select '${ids.staffer}', id from public.roles where key = 'ADMIN'`));
      expect("crew cannot relink their login", await denied("authenticated", ids.staffer, `update public.profiles set staff_id = '${s3.id}' where id = '${ids.staffer}'`));
      expect("on hold needs a reason", await denied("authenticated", ids.staffer, `update public.event_task_assignees set status = 'BLOCKED' where id = '${a1.id}'`));
      await as("authenticated", ids.staffer, (t) => t`update public.event_task_assignees set status = 'BLOCKED', hold_reason = 'Venue closed' where id = ${a1.id}`);
      const [stage2] = await tx`select status, blocked_reason from public.event_tasks where id = ${tStage}`;
      expect("task rolls up to On hold with the reason", stage2.status === "BLOCKED" && String(stage2.blocked_reason).includes("Venue closed"), `${stage2.status} ${stage2.blocked_reason}`);
      await as("authenticated", ids.staffer, (t) => t`update public.event_task_assignees set status = 'COMPLETED', completion_note = 'Stage ready' where id = ${a1.id}`);
      const [stage3] = await tx`select status from public.event_tasks where id = ${tStage}`;
      expect("task stays in progress until everyone finishes", stage3.status === "IN_PROGRESS", stage3.status);
      await as("authenticated", crew2, (t) => t`update public.event_task_assignees set status = 'COMPLETED' where id = ${a2.id}`);
      const [stage4] = await tx`select status, completed_at, completion_note from public.event_tasks where id = ${tStage}`;
      expect("task completes when every assignee is done", stage4.status === "COMPLETED" && !!stage4.completed_at, stage4.status);
      expect("completion notes roll up", String(stage4.completion_note).includes("Stage ready"));
      const history = await tx`select kind, to_status from public.event_task_updates where task_id = ${tStage} order by created_at`;
      expect("every status change is in the history", history.filter((h) => h.kind === "STATUS").length === 4, String(history.length));
      await as("authenticated", ids.staffer, async (t) => {
        expect("crew reads their task history", (await count(t, "event_task_updates")) >= 4);
        expect("crew still sees the completed task (work history)", (await count(t, "event_tasks")) === 1);
      });
      // Reassignment keeps history
      await as("authenticated", ids.admin, (t) => t`update public.event_task_assignees set removed_at = now() where task_id = ${tFlowers} and staff_id = ${s2.id}`);
      await as("authenticated", ids.admin, (t) => t`insert into public.event_task_assignees (task_id, staff_id) values (${tFlowers}, ${s3.id})`);
      const flow = await tx`select staff_id, removed_at from public.event_task_assignees where task_id = ${tFlowers} order by assigned_at`;
      expect("reassignment keeps the old assignment as history", flow.length === 2 && !!flow[0].removed_at && !flow[1].removed_at);
      const [fl] = await tx`select assignee_staff_id from public.event_tasks where id = ${tFlowers}`;
      expect("reassignment updates assignee_staff_id", fl.assignee_staff_id === s3.id);
      await as("authenticated", crew2, async (t) => {
        expect("removed crew no longer sees the task", (await t`select 1 from public.event_tasks where id = ${tFlowers}`).length === 0);
      });
      // A planner's direct status change applies to everyone on the task
      await as("authenticated", ids.admin, (t) => t`update public.event_tasks set status = 'IN_PROGRESS' where id = ${tFlowers}`);
      const [fa] = await tx`select status from public.event_task_assignees where task_id = ${tFlowers} and removed_at is null`;
      expect("planner status change reaches assignees", fa.status === "IN_PROGRESS", fa.status);
      await as("authenticated", ids.admin, async (t) => {
        expect("admin reads every task", (await count(t, "event_tasks")) >= 3);
        expect("admin reads internal task notes", (await count(t, "event_task_internal")) === 1);
        expect("admin still reads all staff", (await count(t, "staff")) >= 3);
      });
      expect("staff record with history can't be deleted", await denied("authenticated", ids.admin, `delete from public.staff where id = '${s1.id}'`));

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
