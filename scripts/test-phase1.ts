/**
 * Phase 1 database tests — connected CRM workflow + event workspace (migrations 00019–00020).
 *
 *   npx tsx scripts/test-db.ts                     (other terminal: throw-away Postgres)
 *   DATABASE_URL=postgres://postgres:postgres@localhost:54339/timeless npm run db:migrate
 *   DATABASE_URL=… npx tsx scripts/test-phase1.ts
 *
 * Writes demo records and commits them (concurrency can only be tested across real
 * transactions), so it refuses to run against anything but a local database.
 */
import { config } from "dotenv";
config({ path: [".env.test", ".env"], quiet: true });

import { randomUUID } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error("Refusing to run: DATABASE_URL must point at a local test database (localhost).");
  process.exit(1);
}

const sql = postgres(url, { max: 6, onnotice: () => {}, prepare: false });
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
  await sql`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${key}-${tag}@phase1.test`}, ${sql.json({ full_name: key })})`;
  if (role) await sql`insert into public.user_roles (user_id, role_id) select ${id}, id from public.roles where key = ${role}`;
  return id;
}
async function teamMember(name: string, userId: string) {
  const [s] = await sql`insert into public.staff (name) values (${name}) returning id`;
  await sql`update public.profiles set staff_id = ${s.id} where id = ${userId}`;
  return s.id as string;
}

async function main() {
  const admin = await user("admin", "ADMIN");
  const manager = await user("manager", "EVENT_MANAGER");
  const sales = await user("sales", "SALES");
  const fieldA = await user("fieldA", "STAFF");
  const fieldB = await user("fieldB", "STAFF");
  const fieldC = await user("fieldC", "STAFF");
  const staffA = await teamMember("Asha", fieldA);
  const staffB = await teamMember("Bikash", fieldB);
  await teamMember("Chandra", fieldC);

  /* ───────── Sales records ───────── */
  const [cust] = await sql`insert into public.customers (name, phone, email) values ('Sita Sharma', '9800011111', ${`sita-${tag}@x.test`}) returning id`;
  const [lead] = await sql`insert into public.leads (number, name, phone, customer_id, event_type, requirements) values (${`LD-P1-${tag}`}, 'Sita Sharma', '9800011111', ${cust.id}, 'wedding', 'Ivory and gold stage') returning id`;
  const [inq] = await sql`insert into public.inquiries (number, name, phone, event_type, lead_id, customer_id, theme, message) values (${`IQ-P1-${tag}`}, 'Sita Sharma', '9800011111', 'wedding', ${lead.id}, ${cust.id}, 'Royal ivory', 'Stage, entrance, 200 guests') returning id`;
  const [item1] = await sql`insert into public.inventory_items (sku, name, quantity) values (${`P1-ARCH-${tag}`}, 'Gold arch', 10) returning id`;

  const quote = async (status: string, withInquiry = true) => {
    const [q] = await sql`insert into public.quotations (number, customer_id, lead_id, inquiry_id, title, event_type, event_date, venue, guest_count, status, public_token, subtotal, total, deposit_amount)
      values (${`QT-P1-${randomUUID().slice(0, 8)}`}, ${cust.id}, ${lead.id}, ${withInquiry ? inq.id : null}, 'Sharma wedding', 'wedding', current_date + 30, 'Hotel Yak', 200, ${status}, ${randomUUID()}, 150000, 150000, 50000) returning id`;
    await sql`insert into public.quotation_items (quotation_id, position, description, details, quantity, unit, unit_price, amount, inventory_item_id) values
      (${q.id}, 0, 'Stage decoration', 'Ivory drapes', 1, 'set', 100000, 100000, null),
      (${q.id}, 1, 'Entrance arch', null, 2, 'pcs', 25000, 50000, ${item1.id})`;
    return q.id as string;
  };

  /* ───────── A. Quotation → booking ───────── */
  const q1 = await quote("DRAFT", false);
  const salesTry = await failure(() => asUser(sales, (t) => t`select public.convert_quotation_to_booking(${q1}::uuid, 'PENDING', 'Sales')`));
  expect("sales (no quotations.approve) cannot convert", !!salesTry && /permission/i.test(salesTry), String(salesTry));

  const [r1] = await asUser(admin, (t) => t`select public.convert_quotation_to_booking(${q1}::uuid, 'CONFIRMED', 'Admin') as r`);
  const res1 = r1.r as { bookingId: string; eventId: string; existed: boolean };
  expect("conversion creates a booking", !!res1.bookingId && res1.existed === false);
  const items = await sql`select quotation_item_id, description, details from public.booking_items where booking_id = ${res1.bookingId} order by position`;
  expect("all quoted lines become confirmed services", items.length === 2);
  expect("each service traces to its quotation line", items.every((i) => i.quotation_item_id), JSON.stringify(items));
  expect("service details carried over", items[0]?.details === "Ivory drapes");
  const [bk1] = await sql`select status, inquiry_id, quotation_id, confirmed_at from public.bookings where id = ${res1.bookingId}`;
  expect("booking finds the inquiry through the lead", bk1.inquiry_id === inq.id);
  expect("booking linked to the accepted quotation", bk1.quotation_id === q1 && bk1.status === "CONFIRMED" && !!bk1.confirmed_at);
  const [ev1] = await sql`select booking_id, customer_id, theme, venue, guest_count from public.events where id = ${res1.eventId}`;
  expect("event workspace linked to booking and customer", ev1.booking_id === res1.bookingId && ev1.customer_id === cust.id);
  expect("event starts with the customer's theme", ev1.theme === "Royal ivory");
  const [qa] = await sql`select status, accepted_at, accepted_name from public.quotations where id = ${q1}`;
  expect("quotation marked accepted by staff", qa.status === "ACCEPTED" && !!qa.accepted_at && qa.accepted_name === "Approved by Admin");
  const versions = await sql`select reason from public.quotation_versions where quotation_id = ${q1}`;
  expect("accepted version frozen", versions.length === 1 && versions[0].reason === "Accepted");
  const [iqs] = await sql`select status from public.inquiries where id = ${inq.id}`;
  expect("inquiry confirmed", iqs.status === "CONFIRMED");

  const [r2] = await asUser(admin, (t) => t`select public.convert_quotation_to_booking(${q1}::uuid, 'PENDING', 'Admin') as r`);
  expect("repeating the conversion returns the same booking", (r2.r as { bookingId: string; existed: boolean }).existed && (r2.r as { bookingId: string }).bookingId === res1.bookingId);

  const q2 = await quote("SENT");
  const both = await Promise.allSettled([
    asUser(admin, (t) => t`select public.convert_quotation_to_booking(${q2}::uuid, 'PENDING', 'Admin') as r`),
    asUser(admin, (t) => t`select public.convert_quotation_to_booking(${q2}::uuid, 'PENDING', 'Admin') as r`),
  ]);
  const [count2] = await sql`select count(*)::int as c from public.bookings where quotation_id = ${q2}`;
  expect("concurrent acceptance creates exactly one booking", count2.c === 1, `bookings: ${count2.c}`);
  const ok2 = both.filter((b) => b.status === "fulfilled") as PromiseFulfilledResult<postgres.RowList<postgres.Row[]>>[];
  expect("both concurrent calls succeed and agree", ok2.length === 2 && ok2[0].value[0].r.bookingId === ok2[1].value[0].r.bookingId, JSON.stringify(both.map((b) => b.status)));
  const [itemsQ2] = await sql`select count(*)::int as c from public.booking_items bi join public.bookings b on b.id = bi.booking_id where b.quotation_id = ${q2}`;
  expect("services not duplicated by concurrent acceptance", itemsQ2.c === 2, `items ${itemsQ2.c}`);

  const q3 = await quote("REJECTED");
  const rej = await failure(() => asUser(admin, (t) => t`select public.convert_quotation_to_booking(${q3}::uuid)`));
  expect("rejected quotation can't be booked", !!rej && /rejected/i.test(rej), String(rej));
  const [q4] = await sql`insert into public.quotations (number, customer_id, title, status, public_token) values (${`QT-P1-ND-${tag}`}, ${cust.id}, 'No date', 'SENT', ${randomUUID()}) returning id`;
  const nod = await failure(() => asUser(admin, (t) => t`select public.convert_quotation_to_booking(${q4.id}::uuid)`));
  expect("missing event date is rejected", !!nod && /event date/i.test(nod), String(nod));

  /* ───────── B. Inquiry → customer ───────── */
  const [lead2] = await sql`insert into public.leads (number, name, phone) values (${`LD-P1B-${tag}`}, 'Ram Thapa', '9811122222') returning id`;
  const [inq2] = await sql`insert into public.inquiries (number, name, phone, event_type, lead_id, customer_match, possible_customer_id) values (${`IQ-P1B-${tag}`}, 'Ram Thapa', '9811122222', 'pasni', ${lead2.id}, 'REVIEW', ${cust.id}) returning id`;
  const [linked] = await asUser(sales, (t) => t`select public.link_inquiry_customer(${inq2.id}::uuid, ${cust.id}::uuid) as r`);
  expect("sales links an inquiry to an existing customer", (linked.r as { customerId: string }).customerId === cust.id);
  const [inq2Row] = await sql`select customer_id, customer_match, possible_customer_id, converted_by, name, phone, event_type from public.inquiries where id = ${inq2.id}`;
  expect("inquiry keeps what was submitted", inq2Row.name === "Ram Thapa" && inq2Row.phone === "9811122222" && inq2Row.event_type === "pasni");
  expect("conversion recorded (who, how)", inq2Row.customer_match === "LINKED" && inq2Row.converted_by === sales && inq2Row.possible_customer_id === null);
  const [lead2Row] = await sql`select customer_id from public.leads where id = ${lead2.id}`;
  expect("lead gets the customer too", lead2Row.customer_id === cust.id);
  const again = await failure(() => asUser(sales, (t) => t`select public.link_inquiry_customer(${inq2.id}::uuid, null)`));
  expect("an inquiry can't be converted twice", !!again && /already linked/i.test(again), String(again));

  const [before] = await sql`select count(*)::int as c from public.customers`;
  const [inq3] = await sql`insert into public.inquiries (number, name, phone, event_type, customer_match) values (${`IQ-P1C-${tag}`}, 'Gita Rai', '9822233333', 'birthday', 'REVIEW') returning id`;
  const [created] = await asUser(sales, (t) => t`select public.link_inquiry_customer(${inq3.id}::uuid, null) as r`);
  const [after] = await sql`select count(*)::int as c from public.customers`;
  expect("new customer created from inquiry", (created.r as { created: boolean }).created && after.c === before.c + 1);
  const fieldLink = await failure(() => asUser(fieldA, (t) => t`select public.link_inquiry_customer(${inq3.id}::uuid, null)`));
  expect("field staff can't convert inquiries", !!fieldLink);

  /* ───────── C. Lead → inquiry ───────── */
  const [li1] = await asUser(sales, (t) => t`select public.create_inquiry_from_lead(${lead.id}::uuid, null, (current_date + 40)::date, null, '150', null, null, null) as r`);
  const li1r = li1.r as { inquiryId: string; existed: boolean };
  expect("lead converted to inquiry", !!li1r.inquiryId && !li1r.existed);
  const [li1Row] = await sql`select lead_id, customer_id, message, phone, customer_match from public.inquiries where id = ${li1r.inquiryId}`;
  expect("inquiry carries lead, customer and requirements", li1Row.lead_id === lead.id && li1Row.customer_id === cust.id && li1Row.message === "Ivory and gold stage" && li1Row.customer_match === "LINKED");
  const [li2] = await asUser(sales, (t) => t`select public.create_inquiry_from_lead(${lead.id}::uuid, null, (current_date + 40)::date, null, '150', null, null, null) as r`);
  expect("double submit returns the same inquiry", (li2.r as { inquiryId: string; existed: boolean }).existed && (li2.r as { inquiryId: string }).inquiryId === li1r.inquiryId);
  const [noPhone] = await sql`insert into public.leads (number, name, event_type) values (${`LD-P1N-${tag}`}, 'No phone', 'wedding') returning id`;
  const np = await failure(() => asUser(sales, (t) => t`select public.create_inquiry_from_lead(${noPhone.id}::uuid)`));
  expect("lead without phone needs one first", !!np && /phone/i.test(np), String(np));

  /* ───────── D. Inventory ───────── */
  const event = async (title: string, dayOffset: number) => {
    const [e] = await sql`insert into public.events (title, event_date, start_at, end_at) values (${title}, current_date + ${dayOffset}::int, (current_date + ${dayOffset}::int)::timestamp + time '07:00', (current_date + ${dayOffset}::int)::timestamp + time '23:00') returning id`;
    return e.id as string;
  };
  const evA = await event("Event A", 60);
  const evB = await event("Event B", 60);
  const evFar = await event("Event far", 90);
  const line = (id: string, q: number) => JSON.stringify([{ item_id: id, quantity: q }]);

  const [ra] = await asUser(manager, (t) => t`select public.reserve_event_inventory(${evA}::uuid, ${line(item1.id, 7)}::text::jsonb, 'A') as r`);
  expect("reserve within stock", (ra.r as { ok: boolean }).ok);
  const [rb] = await asUser(manager, (t) => t`select public.reserve_event_inventory(${evB}::uuid, ${line(item1.id, 5)}::text::jsonb, 'B') as r`);
  const rbr = rb.r as { ok: boolean; shortages: { available: number }[] };
  expect("overlapping event can't over-reserve", !rbr.ok && rbr.shortages[0]?.available === 3, JSON.stringify(rbr));
  const [bHeld] = await sql`select count(*)::int as c from public.inventory_reservation_items ri join public.inventory_reservations r on r.id = ri.reservation_id where r.event_id = ${evB}`;
  expect("nothing reserved when short (strict mode)", bHeld.c === 0);
  const [rbp] = await asUser(manager, (t) => t`select public.reserve_event_inventory(${evB}::uuid, ${line(item1.id, 5)}::text::jsonb, 'B', true) as r`);
  const [bLine] = await sql`select ri.quantity, ri.required from public.inventory_reservation_items ri join public.inventory_reservations r on r.id = ri.reservation_id where r.event_id = ${evB}`;
  expect("partial mode reserves what's free and records the need", (rbp.r as { ok: boolean }).ok && bLine.quantity === 3 && bLine.required === 5, JSON.stringify(bLine));
  const [rf] = await asUser(manager, (t) => t`select public.reserve_event_inventory(${evFar}::uuid, ${line(item1.id, 10)}::text::jsonb) as r`);
  expect("a different date can use all the stock", (rf.r as { ok: boolean }).ok);
  const moves = await sql`select type, quantity from public.inventory_movements where item_id = ${item1.id} order by created_at`;
  expect("every reservation writes a stock movement", moves.length === 3 && moves.every((m) => m.type === "RESERVATION"), JSON.stringify(moves));
  const [stock] = await sql`select quantity from public.inventory_items where id = ${item1.id}`;
  expect("owned stock balance unchanged by reservations", stock.quantity === 10);

  const [item2] = await sql`insert into public.inventory_items (sku, name, quantity) values (${`P1-CHAIR-${tag}`}, 'Chiavari chair', 5) returning id`;
  const evC = await event("Event C", 120);
  const evD = await event("Event D", 120);
  const race = await Promise.all([
    asUser(manager, (t) => t`select public.reserve_event_inventory(${evC}::uuid, ${line(item2.id, 4)}::text::jsonb) as r`),
    asUser(manager, (t) => t`select public.reserve_event_inventory(${evD}::uuid, ${line(item2.id, 4)}::text::jsonb) as r`),
  ]);
  const wins = race.filter((r) => (r[0].r as { ok: boolean }).ok).length;
  const [held2] = await sql`select coalesce(sum(quantity), 0)::int as q from public.inventory_reservation_items where item_id = ${item2.id} and status = 'RESERVED'`;
  expect("concurrent reservations never exceed stock", wins === 1 && held2.q === 4, `wins ${wins}, held ${held2.q}`);
  const fieldRes = await failure(() => asUser(fieldA, (t) => t`select public.reserve_event_inventory(${evFar}::uuid, ${line(item1.id, 1)}::text::jsonb)`));
  expect("field staff can't reserve stock", !!fieldRes);

  /* ───────── E. Designs ───────── */
  const evId = res1.eventId;
  const [dA] = await asUser(manager, (t) => t`insert into public.design_approvals (event_id, title, option_label, area) values (${evId}, 'Stage concept', 'A', 'Stage') returning id`);
  const [dB] = await asUser(manager, (t) => t`insert into public.design_approvals (event_id, title, option_label, area) values (${evId}, 'Stage concept', 'B', 'Stage') returning id`);
  await asUser(manager, (t) => t`update public.design_approvals set status = 'SENT', decision_channel = 'WHATSAPP' where id = ${dA.id}`);
  const frozen = await failure(() => asUser(manager, (t) => t`update public.design_approvals set title = 'Changed' where id = ${dA.id}`));
  expect("a proposed design can't be edited (revision needed)", !!frozen && /revision/i.test(frozen), String(frozen));
  const selectEarly = await failure(() => sql`update public.design_approvals set is_selected = true where id = ${dB.id}`);
  expect("only an approved design can be selected", !!selectEarly);
  await asUser(manager, (t) => t`update public.design_approvals set status = 'APPROVED', client_response = 'Love it', decision_channel = 'IN_PERSON' where id = ${dA.id}`);
  let [a] = await sql`select is_selected, approved_at, approved_by from public.design_approvals where id = ${dA.id}`;
  expect("approving selects the option and records who", a.is_selected && !!a.approved_at && a.approved_by === manager);
  await asUser(manager, (t) => t`update public.design_approvals set status = 'SENT' where id = ${dB.id}`);
  await asUser(manager, (t) => t`update public.design_approvals set status = 'APPROVED', decision_channel = 'PHONE' where id = ${dB.id}`);
  [a] = await sql`select is_selected, status from public.design_approvals where id = ${dA.id}`;
  const [b] = await sql`select is_selected from public.design_approvals where id = ${dB.id}`;
  expect("approving option B deselects option A (one per area)", b.is_selected && !a.is_selected && a.status === "APPROVED");
  const [dRev] = await asUser(manager, (t) => t`insert into public.design_approvals (event_id, title, option_label, area, parent_id, version) values (${evId}, 'Stage concept', 'B', 'Stage', ${dB.id}, 2) returning id`);
  const [stillB] = await sql`select status, is_selected from public.design_approvals where id = ${dB.id}`;
  expect("a revision keeps the earlier version intact", !!dRev.id && stillB.status === "APPROVED" && stillB.is_selected);
  const hist = await sql`select to_status, channel, actor_id from public.design_approval_history where design_id = ${dA.id} order by created_at`;
  expect("approval history recorded", hist.length === 3 && hist[2].to_status === "APPROVED" && hist[2].channel === "IN_PERSON" && hist[2].actor_id === manager, JSON.stringify(hist));
  const histField = await asUser(fieldA, (t) => t`select count(*)::int as c from public.design_approval_history`);
  expect("field staff can't read design history", histField[0].c === 0);
  const forge = await failure(() => asUser(manager, (t) => t`insert into public.design_approval_history (design_id, event_id, to_status) values (${dA.id}, ${evId}, 'APPROVED')`));
  expect("design history can't be forged", !!forge);

  /* ───────── F. Work orders ───────── */
  const [wo1] = await asUser(manager, (t) => t`select public.create_work_orders_from_services(${evId}::uuid) as n`);
  expect("work orders created from confirmed services", wo1.n === 2, String(wo1.n));
  const [wo2] = await asUser(manager, (t) => t`select public.create_work_orders_from_services(${evId}::uuid) as n`);
  expect("creating them again adds none", wo2.n === 0);
  const wos = await sql`select id, title, booking_item_id from public.work_orders where event_id = ${evId} order by position`;
  expect("work order linked to its service", wos.every((w) => w.booking_item_id) && wos[0].title === "Stage decoration");
  const salesWo = await failure(() => asUser(sales, (t) => t`select public.create_work_orders_from_services(${evId}::uuid)`));
  const [salesWoCount] = await sql`select count(*)::int as c from public.work_orders where event_id = ${evId}`;
  expect("only planners create work orders", !!salesWo || salesWoCount.c === 2);

  /* ───────── G. Tasks ───────── */
  const [task] = await asUser(manager, (t) => t`insert into public.event_tasks (event_id, work_order_id, title) values (${evId}, ${wos[0].id}, 'Build stage frame') returning id`);
  const seeWoBefore = await asUser(fieldA, (t) => t`select count(*)::int as c from public.work_orders where id = ${wos[0].id}`);
  expect("team member doesn't see work orders they're not on", seeWoBefore[0].c === 0);
  await asUser(manager, (t) => t`insert into public.event_task_assignees (task_id, staff_id) values (${task.id}, ${staffA}), (${task.id}, ${staffB})`);
  const seeWo = await asUser(fieldA, (t) => t`select count(*)::int as c from public.work_orders where id = ${wos[0].id}`);
  const seeOther = await asUser(fieldA, (t) => t`select count(*)::int as c from public.work_orders where id = ${wos[1].id}`);
  expect("team member sees the work order of their task only", seeWo[0].c === 1 && seeOther[0].c === 0);
  const seeFinance = await asUser(fieldA, (t) => t`select (select count(*) from public.bookings)::int as b, (select count(*) from public.customers)::int as c`);
  expect("team member sees no bookings or customers", seeFinance[0].b === 0 && seeFinance[0].c === 0);

  await asUser(fieldA, (t) => t`update public.event_task_assignees set status = 'WAITING_MATERIALS', hold_reason = 'Need 20m ivory drape' where task_id = ${task.id} and staff_id = ${staffA}`);
  let [tk] = await sql`select status, blocked_reason from public.event_tasks where id = ${task.id}`;
  expect("waiting for materials rolls up with the reason", tk.status === "WAITING_MATERIALS" && /ivory drape/.test(tk.blocked_reason ?? ""), JSON.stringify(tk));
  await asUser(fieldA, (t) => t`update public.event_task_assignees set status = 'REVIEW' where task_id = ${task.id} and staff_id = ${staffA}`);
  await asUser(fieldB, (t) => t`update public.event_task_assignees set status = 'COMPLETED' where task_id = ${task.id} and staff_id = ${staffB}`);
  [tk] = await sql`select status from public.event_tasks where id = ${task.id}`;
  expect("review required once everyone has finished or asked for review", tk.status === "REVIEW", tk.status);
  const cancelByStaff = await failure(() => asUser(fieldA, (t) => t`update public.event_task_assignees set status = 'CANCELLED' where task_id = ${task.id} and staff_id = ${staffA}`));
  expect("team members can't cancel work", !!cancelByStaff && /planners/i.test(cancelByStaff), String(cancelByStaff));
  const hist2 = await sql`select to_status, note from public.event_task_updates where task_id = ${task.id} and kind = 'STATUS' order by created_at`;
  expect("task history keeps every step", hist2.map((h) => h.to_status).join(",") === "WAITING_MATERIALS,REVIEW,COMPLETED" && hist2[0].note === "Need 20m ivory drape", JSON.stringify(hist2));

  const [ck] = await asUser(manager, (t) => t`insert into public.event_task_checklist_items (task_id, label) values (${task.id}, 'Frame bolted') returning id`);
  await asUser(fieldA, (t) => t`update public.event_task_checklist_items set done_at = now() where id = ${ck.id}`);
  const [ckRow] = await sql`select done_by from public.event_task_checklist_items where id = ${ck.id}`;
  expect("team member ticks a checklist item (recorded as them)", ckRow.done_by === fieldA);
  const rename = await failure(() => asUser(fieldA, (t) => t`update public.event_task_checklist_items set label = 'x' where id = ${ck.id}`));
  expect("team member can't edit the checklist itself", !!rename);
  const seeCk = await asUser(fieldC, (t) => t`select count(*)::int as c from public.event_task_checklist_items where id = ${ck.id}`);
  expect("other team members don't see the checklist", seeCk[0].c === 0);

  const [cm] = await asUser(fieldA, (t) => t`insert into public.event_task_comments (task_id, body) values (${task.id}, 'Drape delivered') returning id, author_id`);
  expect("comment written as the author", cm.author_id === fieldA);
  const spoof = await failure(() => asUser(fieldA, (t) => t`insert into public.event_task_comments (task_id, body, author_id) values (${task.id}, 'x', ${fieldB})`));
  expect("can't comment as someone else", !!spoof);
  const seeCm = await asUser(fieldB, (t) => t`select count(*)::int as c from public.event_task_comments where task_id = ${task.id}`);
  const seeCmC = await asUser(fieldC, (t) => t`select count(*)::int as c from public.event_task_comments where task_id = ${task.id}`);
  expect("co-workers on the task see comments; others don't", seeCm[0].c === 1 && seeCmC[0].c === 0);
  const edit = await failure(() => asUser(fieldA, (t) => t`update public.event_task_comments set body = 'edited' where id = ${cm.id}`));
  expect("comments can't be edited", !!edit);

  /* ───────── H. Completion ───────── */
  const tooEarly = await failure(() => asUser(manager, (t) => t`select public.complete_event(${evId}::uuid, 'done')`));
  expect("can't complete with open work", !!tooEarly && /still open/i.test(tooEarly), String(tooEarly));
  const fieldClose = await failure(() => asUser(fieldA, (t) => t`select public.complete_event(${evId}::uuid)`));
  expect("field staff can't complete events", !!fieldClose && /permission/i.test(fieldClose), String(fieldClose));
  const salesClose = await failure(() => asUser(sales, (t) => t`select public.complete_event(${evId}::uuid)`));
  expect("sales can't complete events", !!salesClose && /permission/i.test(salesClose), String(salesClose));

  await sql`insert into public.payments (number, booking_id, customer_id, amount, method, paid_at) values (${`RC-P1-${tag}`}, ${res1.bookingId}, ${cust.id}, 50000, 'CASH', current_date)`;
  await asUser(manager, (t) => t`update public.event_tasks set status = 'COMPLETED' where id = ${task.id}`);
  await asUser(manager, (t) => t`update public.work_orders set status = 'DONE' where event_id = ${evId}`);
  const [woDone] = await sql`select completed_at, completed_by from public.work_orders where id = ${wos[0].id}`;
  const woHist = await sql`select to_status from public.work_order_updates where work_order_id = ${wos[0].id}`;
  expect("work order completion recorded with history", !!woDone.completed_at && woDone.completed_by === manager && woHist.length === 1);
  // Stock out at the event must be accounted for before closing
  const [item3] = await sql`insert into public.inventory_items (sku, name, quantity) values (${`P1-LAMP-${tag}`}, 'Lantern', 4) returning id`;
  await asUser(manager, (t) => t`select public.reserve_event_inventory(${evId}::uuid, ${line(item3.id, 2)}::text::jsonb)`);
  const invOut = await failure(() => asUser(manager, (t) => t`select public.complete_event(${evId}::uuid)`));
  expect("inventory must be returned before closing", !!invOut && /inventory/i.test(invOut), String(invOut));
  await asUser(manager, (t) => t`update public.inventory_reservation_items set status = 'RETURNED' where item_id = ${item3.id}`);
  const closed = await failure(() => asUser(manager, (t) => t`select public.complete_event(${evId}::uuid, 'All good')`));
  expect("event closes once work and inventory are settled", closed === null, String(closed));
  {
    const [evDone] = await sql`select status, completed_by from public.events where id = ${evId}`;
    const [bkDone] = await sql`select status, amount_paid, total_amount from public.bookings where id = ${res1.bookingId}`;
    const [pays] = await sql`select count(*)::int as c, sum(amount)::int as s from public.payments where booking_id = ${res1.bookingId}`;
    expect("event completed by the manager", evDone.status === "COMPLETED" && evDone.completed_by === manager);
    expect("booking completed but payment NOT settled", bkDone.status === "COMPLETED" && bkDone.amount_paid === 50000 && bkDone.total_amount === 150000, JSON.stringify(bkDone));
    expect("completion doesn't create or change payments", pays.c === 1 && pays.s === 50000);
    const twice = await failure(() => asUser(manager, (t) => t`select public.complete_event(${evId}::uuid)`));
    expect("an event is completed once", !!twice && /already completed/i.test(twice));
  }

  /* ───────── I. Existing data shapes still work ───────── */
  const [legacyTask] = await asUser(manager, (t) => t`insert into public.event_tasks (event_id, title, assignee_staff_id) values (${evA}, 'Legacy single assignee', ${staffA}) returning id`);
  const [legacyAssign] = await sql`select count(*)::int as c from public.event_task_assignees where task_id = ${legacyTask.id} and removed_at is null`;
  expect("older single-assignee tasks still mirror into assignments", legacyAssign.c === 1);
  await asUser(fieldA, (t) => t`update public.event_task_assignees set status = 'ACCEPTED' where task_id = ${legacyTask.id}`);
  await asUser(fieldA, (t) => t`update public.event_task_assignees set status = 'IN_PROGRESS' where task_id = ${legacyTask.id}`);
  await asUser(fieldA, (t) => t`update public.event_task_assignees set status = 'COMPLETED', completion_note = 'Done' where task_id = ${legacyTask.id}`);
  const [lt] = await sql`select status, completed_at, completed_by, completion_note from public.event_tasks where id = ${legacyTask.id}`;
  expect("existing accept → start → complete flow unchanged", lt.status === "COMPLETED" && !!lt.completed_at && lt.completed_by === fieldA && /Done/.test(lt.completion_note), JSON.stringify(lt));
  await asUser(manager, (t) => t`update public.event_tasks set status = 'CANCELLED' where id = ${legacyTask.id}`);
  const [ltc] = await sql`select t.status, a.status as a_status from public.event_tasks t join public.event_task_assignees a on a.task_id = t.id where t.id = ${legacyTask.id}`;
  expect("planner cancels a task for everyone on it", ltc.status === "CANCELLED" && ltc.a_status === "CANCELLED", JSON.stringify(ltc));

  await sql.end();
  console.log(`Phase 1 tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await sql.end().catch(() => {});
  process.exit(1);
});
