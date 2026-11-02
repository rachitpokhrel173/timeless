/**
 * Phase 3 database tests — staff logins, roles, account functions and manager review (00021).
 *
 *   npx tsx scripts/test-db.ts                     (other terminal: throw-away Postgres)
 *   DATABASE_URL=postgres://postgres:postgres@localhost:54339/timeless npm run db:migrate
 *   DATABASE_URL=… npx tsx scripts/test-phase3.ts
 *
 * Everything runs inside one transaction that is rolled back. Refuses to run against anything
 * but a local database.
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

const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: false });
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
        ["superAdmin", "admin", "manager", "eventManager", "staffA", "staffB", "fresh", "fresh2", "client", "office"].map((k) => [k, randomUUID()]),
      ) as Record<string, string>;
      for (const [k, id] of Object.entries(ids)) {
        await tx`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${k}@p3.test`}, ${tx.json({ full_name: k })})`;
      }
      const grant = (user: string, key: string) => tx`insert into public.user_roles (user_id, role_id) select ${user}, id from public.roles where key = ${key}`;
      await grant(ids.superAdmin, "SUPER_ADMIN");
      await grant(ids.admin, "ADMIN");
      await grant(ids.manager, "MANAGER");
      await grant(ids.eventManager, "EVENT_MANAGER");
      await grant(ids.staffA, "STAFF");
      await grant(ids.staffB, "STAFF");
      await grant(ids.office, "SALES");

      const [sA] = await tx`insert into public.staff (name, email) values ('Asha', 'staffa@p3.test') returning id`;
      const [sB] = await tx`insert into public.staff (name, email) values ('Bikash', 'staffb@p3.test') returning id`;
      const [sC] = await tx`insert into public.staff (name) values ('Chandra') returning id`;
      const [sD] = await tx`insert into public.staff (name) values ('Dipa') returning id`;
      const [sArch] = await tx`insert into public.staff (name, archived_at, active) values ('Gone', now(), false) returning id`;
      await tx`update public.profiles set staff_id = ${sA.id} where id = ${ids.staffA}`;
      await tx`update public.profiles set staff_id = ${sB.id} where id = ${ids.staffB}`;
      const [cust] = await tx`insert into public.customers (name, phone, auth_user_id) values ('Client', '9800000009', ${ids.client}) returning id`;
      void cust;

      const as = async <T>(userId: string, fn: (t: Tx) => Promise<T>) =>
        tx.savepoint(async (sp) => {
          await sp.unsafe("set local role authenticated");
          await sp`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
          const result = await fn(sp as unknown as Tx);
          await sp.unsafe("reset role");
          await sp`select set_config('request.jwt.claims', '', true)`;
          return result;
        });
      /** Error message when the statement fails, else null. */
      const fails = async (userId: string, run: (t: Tx) => Promise<unknown>) => {
        try {
          await as(userId, run);
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      };

      // ── Permission seed ──
      const perm = async (role: string) =>
        (await tx`select count(*)::int c from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.key = ${role} and rp.permission_key = 'staff.invite'`)[0].c === 1;
      expect("staff.invite exists", (await tx`select 1 from public.permissions where key = 'staff.invite'`).length === 1);
      expect("Super Admin and Admin get staff.invite", (await perm("SUPER_ADMIN")) && (await perm("ADMIN")));
      expect("Manager, Event Manager and Staff don't get staff.invite", !(await perm("MANAGER")) && !(await perm("EVENT_MANAGER")) && !(await perm("STAFF")));

      // ── Staff fields & uniqueness ──
      await tx`update public.staff set employee_code = 'TT-001', department = 'Décor', employment_type = 'FULL_TIME', joined_on = current_date where id = ${sC.id}`;
      let err: string | null = null;
      try {
        await tx.savepoint((sp) => sp`update public.staff set employee_code = 'tt-001 ' where id = ${sD.id}`);
      } catch (e) {
        err = (e as Error).message;
      }
      expect("employee codes are unique (case/space-insensitive)", !!err && /unique|duplicate/i.test(err), err ?? "no error");
      err = null;
      try {
        await tx.savepoint((sp) => sp`update public.staff set employment_type = 'SLAVE' where id = ${sD.id}`);
      } catch (e) {
        err = (e as Error).message;
      }
      expect("employment type is restricted", !!err);
      err = null;
      try {
        await tx.savepoint((sp) => sp`update public.profiles set staff_id = ${sA.id} where id = ${ids.fresh}`);
      } catch (e) {
        err = (e as Error).message;
      }
      expect("one login per team member (unique profiles.staff_id)", !!err && /unique|duplicate/i.test(err), err ?? "no error");

      // ── link_staff_login ──
      expect("staff can't link logins", !!(await fails(ids.staffA, (t) => t`select public.link_staff_login(${sC.id}, ${ids.fresh}, 'STAFF')`)));
      expect("event manager can't link logins", !!(await fails(ids.eventManager, (t) => t`select public.link_staff_login(${sC.id}, ${ids.fresh}, 'STAFF')`)));
      expect("sales (office) can't link logins", !!(await fails(ids.office, (t) => t`select public.link_staff_login(${sC.id}, ${ids.fresh}, 'STAFF')`)));
      err = await fails(ids.admin, (t) => t`select public.link_staff_login(${sC.id}, ${ids.fresh}, 'STAFF')`);
      expect("admin links a fresh login with the STAFF role", err === null, err ?? "");
      const [linked] = await tx`select staff_id from public.profiles where id = ${ids.fresh}`;
      expect("the link is stored on the profile", linked.staff_id === sC.id);
      const [roleRow] = await tx`select r.key from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = ${ids.fresh}`;
      expect("the STAFF role was granted", roleRow?.key === "STAFF");
      err = await fails(ids.admin, (t) => t`select public.link_staff_login(${sC.id}, ${ids.fresh}, 'STAFF')`);
      expect("linking the same pair again is a no-op", err === null, err ?? "");
      err = await fails(ids.admin, (t) => t`select public.link_staff_login(${sD.id}, ${ids.fresh}, 'STAFF')`);
      expect("a login can't be linked to a second team member", !!err && /already linked/.test(err), err ?? "");
      err = await fails(ids.admin, (t) => t`select public.link_staff_login(${sC.id}, ${ids.fresh2}, 'STAFF')`);
      expect("a team member can't get a second login", !!err && /already has a login/.test(err), err ?? "");
      err = await fails(ids.admin, (t) => t`select public.link_staff_login(${sD.id}, ${ids.client}, 'STAFF')`);
      expect("client-portal logins can't be linked", !!err && /client login/.test(err), err ?? "");
      err = await fails(ids.admin, (t) => t`select public.link_staff_login(${sArch.id}, ${ids.fresh2}, 'STAFF')`);
      expect("archived team members can't be linked", !!err && /archived/.test(err), err ?? "");
      err = await fails(ids.admin, (t) => t`select public.link_staff_login(${sD.id}, ${ids.fresh2}, 'SUPER_ADMIN')`);
      expect("an admin can't grant Super Admin while linking", !!err && /Super Admin/.test(err), err ?? "");
      expect("…and nothing was half-done", (await tx`select staff_id from public.profiles where id = ${ids.fresh2}`)[0].staff_id === null);
      err = await fails(ids.admin, (t) => t`select public.link_staff_login(${sD.id}, ${ids.office}, 'STAFF')`);
      expect("admin may link a login that already has an office role", err === null, err ?? "");
      await tx`select set_config('app.staff_link', 'on', true)`;
      await tx`update public.profiles set staff_id = null where id = ${ids.office}`;
      await tx`select set_config('app.staff_link', '', true)`;

      // A role-limited inviter: give MANAGER staff.invite for these checks
      await tx`insert into public.role_permissions (role_id, permission_key) select id, 'staff.invite' from public.roles where key = 'MANAGER'`;
      err = await fails(ids.manager, (t) => t`select public.link_staff_login(${sD.id}, ${ids.fresh2}, 'EVENT_MANAGER')`);
      expect("staff.invite alone can't hand out roles other than Staff", !!err && /administrator/.test(err), err ?? "");
      err = await fails(ids.manager, (t) => t`select public.link_staff_login(${sD.id}, ${ids.office}, 'STAFF')`);
      expect("staff.invite alone can't link a login with office access", !!err && /office access/.test(err), err ?? "");
      err = await fails(ids.manager, (t) => t`select public.link_staff_login(${sD.id}, ${ids.fresh2}, 'STAFF')`);
      expect("staff.invite links a fresh login as Staff", err === null, err ?? "");

      // ── Profiles guard still protects direct edits ──
      err = await fails(ids.staffA, (t) => t`update public.profiles set staff_id = ${sD.id} where id = ${ids.staffA}`);
      const [stillA] = await tx`select staff_id from public.profiles where id = ${ids.staffA}`;
      expect("a team member can't re-link their own login", stillA.staff_id === sA.id, err ?? "no error but unchanged?");
      err = await fails(ids.staffA, (t) => t`update public.profiles set active = false where id = ${ids.staffB}`);
      expect("a team member can't suspend a colleague", (await tx`select active from public.profiles where id = ${ids.staffB}`)[0].active === true);
      err = await fails(ids.staffA, (t) => t`select set_config('app.staff_link', 'on', true); `);
      // Even if a client could set the flag, it would only let RLS-permitted updates through; staff have no profile update policy for others
      err = await fails(ids.staffA, (t) => t.unsafe(`select set_config('app.staff_link', 'on', true); update public.profiles set staff_id = '${sD.id}' where id = '${ids.staffA}'`));
      expect("setting the linking flag by hand doesn't let a team member re-link", (await tx`select staff_id from public.profiles where id = ${ids.staffA}`)[0].staff_id === sA.id, err ?? "");

      // ── Role escalation ──
      err = await fails(ids.staffA, (t) => t`insert into public.user_roles (user_id, role_id) select ${ids.staffA}, id from public.roles where key = 'ADMIN'`);
      expect("a team member can't give themselves a role", !!err);
      err = await fails(ids.staffA, (t) => t`delete from public.user_roles where user_id = ${ids.staffA}`);
      expect("a team member can't remove their own role", (await tx`select count(*)::int c from public.user_roles where user_id = ${ids.staffA}`)[0].c === 1);
      err = await fails(ids.admin, (t) => t`insert into public.user_roles (user_id, role_id) select ${ids.staffA}, id from public.roles where key = 'SUPER_ADMIN'`);
      expect("an admin can't grant Super Admin", !!err);
      err = await fails(ids.superAdmin, (t) => t`insert into public.user_roles (user_id, role_id) select ${ids.fresh}, id from public.roles where key = 'EVENT_MANAGER'`);
      expect("a Super Admin can change roles", err === null, err ?? "");
      err = await fails(ids.staffA, (t) => t`update public.role_permissions set permission_key = 'users.manage' where permission_key = 'tasks.update'`);
      expect("a team member can't edit role permissions", (await tx`select count(*)::int c from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.key = 'STAFF' and rp.permission_key = 'users.manage'`)[0].c === 0);

      // ── Suspend / reactivate ──
      err = await fails(ids.staffA, (t) => t`select public.set_staff_login_active(${sB.id}, false)`);
      expect("staff can't suspend logins", !!err);
      err = await fails(ids.admin, (t) => t`select public.set_staff_login_active(${sB.id}, false)`);
      expect("admin suspends a team login", err === null && (await tx`select active from public.profiles where id = ${ids.staffB}`)[0].active === false, err ?? "");
      const permsWhileSuspended = await as(ids.staffB, (t) => t`select public.has_permission('tasks.update') as ok, public.my_staff_id() as sid`);
      expect("a suspended login loses every permission and its staff link in RLS", permsWhileSuspended[0].ok === false && permsWhileSuspended[0].sid === null);
      err = await fails(ids.admin, (t) => t`select public.set_staff_login_active(${sB.id}, true)`);
      expect("admin reactivates it", err === null && (await tx`select active from public.profiles where id = ${ids.staffB}`)[0].active === true, err ?? "");
      err = await fails(ids.manager, (t) => t`select public.set_staff_login_active(${sD.id}, false)`);
      expect("staff.invite holder can suspend a field-only login", err === null, err ?? "");
      await tx`update public.profiles set active = true where id = ${ids.fresh2}`;
      // Office login linked to a team member: only users.manage may suspend
      await tx`select set_config('app.staff_link', 'on', true)`;
      await tx`update public.profiles set staff_id = ${sArch.id} where id = ${ids.admin}`;
      await tx`select set_config('app.staff_link', '', true)`;
      err = await fails(ids.manager, (t) => t`select public.set_staff_login_active(${sArch.id}, false)`);
      expect("staff.invite alone can't suspend an office login", !!err && /office access/.test(err), err ?? "");
      err = await fails(ids.admin, (t) => t`select public.set_staff_login_active(${sArch.id}, false)`);
      expect("nobody suspends their own login", !!err && /own login/.test(err), err ?? "");

      // ── Unlink ──
      err = await fails(ids.manager, (t) => t`select public.unlink_staff_login(${sD.id})`);
      expect("staff.invite holder unlinks a field login", err === null && (await tx`select staff_id from public.profiles where id = ${ids.fresh2}`)[0].staff_id === null, err ?? "");
      expect("unlinking keeps the login's role", (await tx`select count(*)::int c from public.user_roles where user_id = ${ids.fresh2}`)[0].c === 1);
      err = await fails(ids.staffA, (t) => t`select public.unlink_staff_login(${sA.id})`);
      expect("staff can't unlink logins", !!err);

      // ── Manager review ──
      const [bk] = await tx`insert into public.bookings (number, customer_id, status, total_amount) values ('BK-P3-1', ${cust.id}, 'CONFIRMED', 1000) returning id`;
      const [ev] = await tx`insert into public.events (booking_id, customer_id, title, event_date, start_at, end_at) values (${bk.id}, ${cust.id}, 'P3 Wedding', current_date + 3, now() + interval '3 days', now() + interval '4 days') returning id`;
      const [rt] = await tx`insert into public.event_tasks (event_id, title, review_required) values (${ev.id}, 'Stage setup', true) returning id`;
      const [ft] = await tx`insert into public.event_tasks (event_id, title) values (${ev.id}, 'Entrance flowers') returning id`;
      await tx`insert into public.event_task_assignees (task_id, staff_id) values (${rt.id}, ${sA.id}), (${rt.id}, ${sB.id}), (${ft.id}, ${sA.id})`;
      expect("existing/new tasks default to no review", (await tx`select review_required from public.event_tasks where id = ${ft.id}`)[0].review_required === false);

      err = await fails(ids.staffA, (t) => t`update public.event_task_assignees set status = 'IN_PROGRESS' where task_id = ${rt.id} and staff_id = ${sA.id}`);
      expect("team member starts review work", err === null, err ?? "");
      err = await fails(ids.staffA, (t) => t`update public.event_task_assignees set status = 'COMPLETED' where task_id = ${rt.id} and staff_id = ${sA.id}`);
      expect("team member can't complete a review task", !!err && /approval/.test(err), err ?? "");
      err = await fails(ids.staffA, (t) => t`update public.event_task_assignees set status = 'REVIEW', completion_note = 'Done, photos added' where task_id = ${rt.id} and staff_id = ${sA.id}`);
      expect("team member submits for review", err === null, err ?? "");
      expect("task still in progress while a co-worker is working", (await tx`select status from public.event_tasks where id = ${rt.id}`)[0].status === "IN_PROGRESS");
      await as(ids.staffB, (t) => t`update public.event_task_assignees set status = 'REVIEW' where task_id = ${rt.id} and staff_id = ${sB.id}`);
      expect("task rolls up to Review required when everyone submitted", (await tx`select status from public.event_tasks where id = ${rt.id}`)[0].status === "REVIEW");
      err = await fails(ids.staffA, (t) => t`update public.event_tasks set review_required = false where id = ${rt.id}`);
      expect("team member can't switch review off", (await tx`select review_required from public.event_tasks where id = ${rt.id}`)[0].review_required === true);
      err = await fails(ids.staffA, (t) => t`update public.event_tasks set status = 'COMPLETED' where id = ${rt.id}`);
      expect("team member can't complete the task itself", (await tx`select status from public.event_tasks where id = ${rt.id}`)[0].status === "REVIEW");
      err = await fails(ids.staffA, (t) => t`update public.event_task_assignees set status = 'IN_PROGRESS' where task_id = ${ft.id} and staff_id = ${sA.id}`);
      err = err ?? (await fails(ids.staffA, (t) => t`update public.event_task_assignees set status = 'COMPLETED' where task_id = ${ft.id} and staff_id = ${sA.id}`));
      expect("tasks without review are still completed by the team (unchanged behaviour)", err === null && (await tx`select status from public.event_tasks where id = ${ft.id}`)[0].status === "COMPLETED", err ?? "");

      // Revisions: the planner sends work back
      err = await fails(ids.eventManager, (t) => t`update public.event_task_assignees set status = 'IN_PROGRESS' where task_id = ${rt.id} and status = 'REVIEW'`);
      expect("event manager requests revisions", err === null && (await tx`select status from public.event_tasks where id = ${rt.id}`)[0].status === "IN_PROGRESS", err ?? "");
      await as(ids.staffA, (t) => t`update public.event_task_assignees set status = 'REVIEW' where task_id = ${rt.id} and staff_id = ${sA.id}`);
      await as(ids.staffB, (t) => t`update public.event_task_assignees set status = 'REVIEW' where task_id = ${rt.id} and staff_id = ${sB.id}`);
      err = await fails(ids.eventManager, (t) => t`update public.event_tasks set status = 'COMPLETED', reviewed_at = now(), reviewed_by = ${ids.eventManager} where id = ${rt.id}`);
      const [approved] = await tx`select status, reviewed_by from public.event_tasks where id = ${rt.id}`;
      const parts = await tx`select status from public.event_task_assignees where task_id = ${rt.id} and removed_at is null`;
      expect("event manager approves: task completed", err === null && approved.status === "COMPLETED" && approved.reviewed_by === ids.eventManager, err ?? approved.status);
      expect("approval completes every assignee's part", parts.every((p) => p.status === "COMPLETED"));
      const history = await tx`select to_status from public.event_task_updates where task_id = ${rt.id} and kind = 'STATUS' order by created_at`;
      expect("review history is recorded", history.some((h) => h.to_status === "REVIEW") && history.some((h) => h.to_status === "COMPLETED"));

      // Older personal tasks (no assignments) follow the same rule
      const [pt] = await tx`insert into public.event_tasks (title, assignee_user_id, review_required) values ('Personal', ${ids.staffA}, true) returning id`;
      err = await fails(ids.staffA, (t) => t`update public.event_tasks set status = 'COMPLETED' where id = ${pt.id}`);
      expect("personal review tasks can't be self-completed", !!err && /approval/.test(err), err ?? "");
      err = await fails(ids.staffA, (t) => t`update public.event_tasks set status = 'REVIEW' where id = ${pt.id}`);
      expect("personal review tasks can be submitted for review", err === null, err ?? "");

      // ── Isolation (unchanged, re-checked with Phase 3 data) ──
      const seen = await as(ids.staffB, (t) => t`select id from public.event_tasks`);
      expect("a team member sees only tasks they're on", seen.length === 1 && seen[0].id === rt.id, `saw ${seen.length}`);
      const staffRows = await as(ids.staffB, (t) => t`select id from public.staff`);
      expect("a team member sees only their own staff record", staffRows.length === 1 && staffRows[0].id === sB.id, `saw ${staffRows.length}`);
      expect("a team member can't read customers", (await as(ids.staffB, (t) => t`select id from public.customers`)).length === 0);
      expect("a team member can't read quotations", (await as(ids.staffB, (t) => t`select id from public.quotations`)).length === 0);
      expect("a team member can't read the activity log", (await as(ids.staffB, (t) => t`select id from public.activity_logs`)).length === 0);

      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });

  console.log(`Phase 3 tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  await sql.end();
  if (failures.length) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
