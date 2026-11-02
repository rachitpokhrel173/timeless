/**
 * Phase 2 tests — event operations (migration 00024 on top of 00019–00023).
 *
 *   npx tsx scripts/test-db.ts                     (other terminal: throw-away Postgres)
 *   DATABASE_URL=postgres://postgres:postgres@localhost:54339/timeless npm run db:migrate
 *   DATABASE_URL=… npx tsx scripts/test-phase2.ts
 *
 * Covers: the accepted quotation can't change (in any way, by anyone) while work orders and tasks
 * are generated from it; staff see only their own work (RLS, not the UI); duplicate assignments;
 * review-required tasks can't be self-approved; optional tasks; the progress formula.
 * Writes demo records and commits them, so it refuses to run against anything but localhost.
 */
import { config } from "dotenv";
config({ path: [".env.test", ".env"], quiet: true });

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { progressBy, progressOf } from "../src/lib/progress";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error("Refusing to run: DATABASE_URL must point at a local test database (localhost).");
  process.exit(1);
}

const sql = postgres(url, { max: 4, onnotice: () => {}, prepare: false });
type Tx = postgres.TransactionSql;

let passed = 0;
const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** Run as a signed-in user (RLS applies), in its own transaction. */
async function asUser<T>(userId: string, fn: (t: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
/** Error message of a call that should fail, or null when it succeeded. */
async function failure(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const tag = randomUUID().slice(0, 6);

async function user(key: string, role: string | null) {
  const id = randomUUID();
  await sql`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${key}-${tag}@phase2.test`}, ${sql.json({ full_name: key })})`;
  if (role) await sql`insert into public.user_roles (user_id, role_id) select ${id}, id from public.roles where key = ${role}`;
  return id;
}
async function teamMember(name: string, userId: string) {
  const [s] = await sql`insert into public.staff (name) values (${name}) returning id`;
  await sql`update public.profiles set staff_id = ${s.id} where id = ${userId}`;
  return s.id as string;
}
/** The accepted agreement as it stands: the quotation's commercial columns and every line. */
async function agreement(quoteId: string) {
  const [q] = await sql`select number, customer_id, title, status, version, subtotal, discount_type, discount_value, discount_amount, tax_rate, tax_amount, total, deposit_percent, deposit_amount, terms, terms_version, accepted_at from public.quotations where id = ${quoteId}`;
  const items = await sql`select id, position, description, details, quantity, unit, unit_price, amount, inventory_item_id from public.quotation_items where quotation_id = ${quoteId} order by position`;
  return JSON.stringify({ q, items });
}

async function main() {
  /* ───────── Pure progress formula ───────── */
  const now = Date.parse("2026-11-03T12:00:00Z");
  const past = "2026-11-01T00:00:00Z";
  const p = progressOf(
    [
      { status: "COMPLETED" },
      { status: "IN_PROGRESS", dueAt: past },
      { status: "REVIEW", dueAt: past },
      { status: "CANCELLED" },
      { status: "COMPLETED", countsTowardProgress: false },
      { status: "TODO", countsTowardProgress: false, dueAt: past },
    ],
    now,
  );
  expect("progress: cancelled and optional tasks are left out", p.total === 3, `total ${p.total}`);
  expect("progress: completed ÷ required", p.done === 1 && p.percent === 33, `${p.done}/${p.total} = ${p.percent}%`);
  expect("progress: overdue counts late open work, not work in review", p.overdue === 1, `overdue ${p.overdue}`);
  expect("progress: nothing planned is 0%", progressOf([]).percent === 0);
  expect("progress: all cancelled is 0% of 0", progressOf([{ status: "CANCELLED" }]).total === 0);
  const grouped = progressBy([{ status: "COMPLETED", k: "a" }, { status: "TODO", k: "a" }, { status: "COMPLETED", k: "b" }], (t) => t.k);
  expect("progress: grouped by work order", grouped.get("a")?.percent === 50 && grouped.get("b")?.percent === 100);

  /* ───────── People ───────── */
  const admin = await user("admin", "ADMIN");
  const manager = await user("manager", "EVENT_MANAGER");
  const fieldA = await user("fieldA", "STAFF");
  const fieldB = await user("fieldB", "STAFF");
  const staffA = await teamMember("Asha P2", fieldA);
  const staffB = await teamMember("Bikash P2", fieldB);

  /* ───────── Quotation → booking → event ───────── */
  const [cust] = await sql`insert into public.customers (name, phone) values ('Gita Rai', '9800022222') returning id`;
  const [q] = await sql`insert into public.quotations (number, customer_id, title, event_type, event_date, venue, guest_count, status, public_token, subtotal, discount_value, discount_amount, tax_rate, tax_amount, total, deposit_amount, terms)
    values (${`QT-P2-${tag}`}, ${cust.id}, 'Rai wedding', 'wedding', current_date + 20, 'Hotel Annapurna', 250, 'SENT', ${randomUUID()}, 160000, 10000, 10000, 13, 19500, 169500, 50000, 'Standard terms v3') returning id`;
  await sql`insert into public.quotation_items (quotation_id, position, description, quantity, unit, unit_price, amount) values
    (${q.id}, 0, 'Stage decoration', 1, 'set', 90000, 90000),
    (${q.id}, 1, 'Flower arrangement', 10, 'pcs', 3000, 30000),
    (${q.id}, 2, 'Entrance decoration', 1, 'set', 40000, 40000)`;

  // Before acceptance the quotation is a draft agreement: edits still work
  expect("draft/sent quotation: lines can still be edited", (await failure(() => sql`update public.quotation_items set unit_price = 91000, amount = 91000 where quotation_id = ${q.id} and position = 0`)) === null);
  await sql`update public.quotation_items set unit_price = 90000, amount = 90000 where quotation_id = ${q.id} and position = 0`;

  const conv = await asUser(admin, (t) => t`select public.convert_quotation_to_booking(${q.id}, 'CONFIRMED', 'Admin P2') as r`);
  const { bookingId, eventId } = conv[0].r as { bookingId: string; eventId: string };
  expect("quotation converts to a confirmed booking with an event", !!bookingId && !!eventId);
  const [qs] = await sql`select status from public.quotations where id = ${q.id}`;
  expect("conversion accepts the quotation", qs.status === "ACCEPTED", qs.status);
  const accepted = await agreement(q.id);

  /* ───────── Work orders from the confirmed services ───────── */
  const made = await asUser(manager, (t) => t`select public.create_work_orders_from_services(${eventId}) as n`);
  expect("work orders created from confirmed services", Number(made[0].n) === 3, `made ${made[0].n}`);
  const wos = await sql`select w.id, w.title, bi.quotation_item_id as qi from public.work_orders w left join public.booking_items bi on bi.id = w.booking_item_id where w.event_id = ${eventId} order by w.position`;
  expect("each work order traces back to its quotation line", wos.length === 3 && wos.every((w) => !!w.qi), JSON.stringify(wos.map((w) => w.qi)));
  const again = await asUser(manager, (t) => t`select public.create_work_orders_from_services(${eventId}) as n`);
  expect("generating work orders twice doesn't duplicate them", Number(again[0].n) === 0, `second run made ${again[0].n}`);

  // Several tasks per work order, assigned to different people
  const task = async (wo: string, title: string, extra: { review?: boolean; optional?: boolean; due?: string } = {}) => {
    const [t] = await asUser(manager, (tx) => tx`insert into public.event_tasks (event_id, work_order_id, title, review_required, counts_toward_progress, due_at, created_by)
      values (${eventId}, ${wo}, ${title}, ${extra.review ?? false}, ${!extra.optional}, ${extra.due ?? null}, ${manager}) returning id`);
    return t.id as string;
  };
  const t1 = await task(wos[0].id, "Build stage frame", { review: true });
  const t2 = await task(wos[0].id, "Drape stage");
  const t3 = await task(wos[1].id, "Arrange flowers", { due: "2020-01-01T00:00:00Z" });
  const tOpt = await task(wos[2].id, "Extra fairy lights (if time)", { optional: true });
  const assign = (taskId: string, staffId: string) => asUser(manager, (t) => t`insert into public.event_task_assignees (task_id, staff_id, assigned_by) values (${taskId}, ${staffId}, ${manager})`);
  await assign(t1, staffA);
  await assign(t2, staffA);
  await assign(t3, staffB);
  await assign(tOpt, staffB);
  expect("the same person can't be assigned twice to one task", (await failure(() => assign(t1, staffA))) !== null);
  expect("several people can share a task", (await failure(() => assign(t1, staffB))) === null);

  expect("generating work orders and tasks leaves the accepted quotation unchanged", (await agreement(q.id)) === accepted);

  /* ───────── The accepted quotation is frozen ───────── */
  const locked = async (who: string, fn: () => Promise<unknown>) => {
    const msg = await failure(fn);
    expect(`accepted quotation: ${who} is refused`, !!msg && /accepted/i.test(msg), msg ?? "succeeded");
  };
  await locked("price change on a line (service role)", () => sql`update public.quotation_items set unit_price = 1 where quotation_id = ${q.id} and position = 0`);
  await locked("quantity change on a line (admin)", () => asUser(admin, (t) => t`update public.quotation_items set quantity = 20 where quotation_id = ${q.id} and position = 1`));
  await locked("new line", () => sql`insert into public.quotation_items (quotation_id, position, description, quantity, unit_price, amount) values (${q.id}, 9, 'Extra', 1, 1, 1)`);
  await locked("deleting a line", () => sql`delete from public.quotation_items where quotation_id = ${q.id} and position = 2`);
  await locked("total change", () => sql`update public.quotations set total = 1 where id = ${q.id}`);
  await locked("discount change", () => sql`update public.quotations set discount_value = 0, discount_amount = 0 where id = ${q.id}`);
  await locked("tax change", () => sql`update public.quotations set tax_rate = 0 where id = ${q.id}`);
  await locked("terms change", () => sql`update public.quotations set terms = 'new terms' where id = ${q.id}`);
  await locked("version change", () => sql`update public.quotations set version = version + 1 where id = ${q.id}`);
  await locked("status change back to draft", () => sql`update public.quotations set status = 'DRAFT' where id = ${q.id}`);
  await locked("hard delete", () => sql`delete from public.quotations where id = ${q.id}`);
  expect("accepted quotation: archiving still works", (await failure(() => sql`update public.quotations set archived_at = now() where id = ${q.id}`)) === null);
  await sql`update public.quotations set archived_at = null where id = ${q.id}`;
  expect("accepted quotation: reference images can still be managed", (await failure(() => sql`update public.quotations set reference_media_ids = '{}' where id = ${q.id}`)) === null);
  expect("after all attempts the agreement is exactly as accepted", (await agreement(q.id)) === accepted);

  /* ───────── Staff see only their own work (RLS) ───────── */
  const seenTasks = await asUser(fieldA, (t) => t`select id from public.event_tasks where event_id = ${eventId}`);
  expect("staff A sees only the tasks they're on", seenTasks.length === 2 && seenTasks.every((r) => [t1, t2].includes(r.id)), `${seenTasks.length} rows`);
  const seenB = await asUser(fieldB, (t) => t`select id from public.event_tasks where event_id = ${eventId}`);
  expect("staff B sees only their tasks (incl. the shared one)", seenB.length === 3, `${seenB.length} rows`);
  const seenWo = await asUser(fieldA, (t) => t`select id from public.work_orders where event_id = ${eventId}`);
  expect("staff A sees only the work order of their tasks", seenWo.length === 1 && seenWo[0].id === wos[0].id, `${seenWo.length} rows`);
  for (const [table, filter] of [
    ["events", sql`id = ${eventId}`],
    ["bookings", sql`id = ${bookingId}`],
    ["quotations", sql`id = ${q.id}`],
    ["quotation_items", sql`quotation_id = ${q.id}`],
    ["booking_items", sql`booking_id = ${bookingId}`],
    ["customers", sql`id = ${cust.id}`],
    ["invoices", sql`booking_id = ${bookingId}`],
    ["payments", sql`booking_id = ${bookingId}`],
  ] as const) {
    const rows = await asUser(fieldA, (t) => t`select 1 from ${sql(`public.${table}` as never)} where ${filter}`).catch((e: Error) => e);
    expect(`staff can't read ${table}`, Array.isArray(rows) ? rows.length === 0 : /permission/i.test(String(rows)), Array.isArray(rows) ? `${rows.length} rows` : String(rows));
  }
  const otherEventTask = await asUser(fieldA, (t) => t`select id from public.event_tasks where id = ${t3}`);
  expect("staff A can't open a colleague's task by id", otherEventTask.length === 0);

  // Writes outside their own assignment
  const qUpd = await asUser(fieldA, (t) => t`update public.quotations set total = 1 where id = ${q.id} returning id`).catch((e: Error) => e);
  expect("staff can't modify a quotation", !Array.isArray(qUpd) || qUpd.length === 0);
  const bUpd = await asUser(fieldA, (t) => t`update public.bookings set total_amount = 1 where id = ${bookingId} returning id`).catch((e: Error) => e);
  expect("staff can't modify billing (booking amounts)", !Array.isArray(bUpd) || bUpd.length === 0);
  expect("staff can't grant themselves a role", (await failure(() => asUser(fieldA, (t) => t`insert into public.user_roles (user_id, role_id) select ${fieldA}, id from public.roles where key = 'ADMIN'`))) !== null);
  const profUpd = await asUser(fieldA, (t) => t`update public.profiles set active = false where id = ${fieldB} returning id`).catch((e: Error) => e);
  expect("staff can't change other accounts", !Array.isArray(profUpd) || profUpd.length === 0);
  const otherAssign = await asUser(fieldA, (t) => t`update public.event_task_assignees set status = 'IN_PROGRESS' where task_id = ${t3} returning id`).catch((e: Error) => e);
  expect("staff can't update a colleague's assignment", !Array.isArray(otherAssign) || otherAssign.length === 0);
  expect("staff can't create tasks", (await failure(() => asUser(fieldA, (t) => t`insert into public.event_tasks (event_id, title) values (${eventId}, 'Sneaky')`))) !== null);
  expect("staff can't mark a task optional", (await failure(() => asUser(fieldA, (t) => t`update public.event_tasks set counts_toward_progress = false where id = ${t2}`))) !== null);

  /* ───────── Review-required work ───────── */
  const mine = (taskId: string, status: string) => asUser(fieldA, (t) => t`update public.event_task_assignees set status = ${status} where task_id = ${taskId} and staff_id = ${staffA} returning id`);
  await mine(t1, "IN_PROGRESS");
  expect("staff can't self-approve a review task", (await failure(() => mine(t1, "COMPLETED"))) !== null);
  await mine(t1, "REVIEW");
  await asUser(fieldB, (t) => t`update public.event_task_assignees set status = 'REVIEW' where task_id = ${t1} and staff_id = ${staffB}`);
  const [r1] = await sql`select status from public.event_tasks where id = ${t1}`;
  expect("when everyone has submitted, the task is Review required", r1.status === "REVIEW", r1.status);
  expect("a submission doesn't close the work order", (await sql`select status from public.work_orders where id = ${wos[0].id}`)[0].status !== "DONE");
  await asUser(manager, (t) => t`update public.event_tasks set status = 'COMPLETED' where id = ${t1}`);
  const [r2] = await sql`select status from public.event_tasks where id = ${t1}`;
  expect("the manager approves it", r2.status === "COMPLETED", r2.status);

  // A non-review task can be finished by the person on it
  await mine(t2, "IN_PROGRESS");
  expect("a normal task can be completed by its assignee", (await failure(() => mine(t2, "COMPLETED"))) === null);

  /* ───────── Progress from real tasks ───────── */
  const rows = await sql`select status, due_at as "dueAt", counts_toward_progress as "countsTowardProgress", work_order_id as wo from public.event_tasks where event_id = ${eventId}`;
  const ev = progressOf(rows as never);
  expect("event progress: optional task left out", ev.total === 3, `total ${ev.total}`);
  expect("event progress: 2 of 3 required done", ev.done === 2 && ev.percent === 67, `${ev.done}/${ev.total} ${ev.percent}%`);
  expect("event progress: the late flower task is overdue", ev.overdue === 1, `overdue ${ev.overdue}`);
  const byWo = progressBy(rows as never as { status: string; wo: string }[], (r) => r.wo);
  expect("work order progress: stage work order complete", byWo.get(wos[0].id)?.percent === 100);
  expect("work order progress: optional-only work order has nothing required", byWo.get(wos[2].id)?.total === 0);
  const [dflt] = await sql`insert into public.event_tasks (event_id, title) values (${eventId}, 'Plain task') returning counts_toward_progress as c`;
  expect("tasks count toward progress unless marked optional (column default)", dflt.c === true, String(dflt.c));

  console.log(`Phase 2 tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  await sql.end();
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
