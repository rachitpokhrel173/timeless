/**
 * Phase 6 database tests — Users & Roles guards (00026).
 *
 *   npx tsx scripts/test-db.ts                     (other terminal: throw-away Postgres)
 *   DATABASE_URL=postgres://postgres:postgres@localhost:54339/timeless npm run db:migrate
 *   DATABASE_URL=… npx tsx scripts/test-phase6.ts
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
      const ids = Object.fromEntries(["super1", "super2", "admin", "hr", "manager", "staff", "fresh"].map((k) => [k, randomUUID()])) as Record<string, string>;
      for (const [k, id] of Object.entries(ids)) {
        await tx`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${k}@p6.test`}, ${tx.json({ full_name: k })})`;
      }
      const roleId = async (key: string) => (await tx`select id from public.roles where key = ${key}`)[0]!.id as string;
      const grant = (user: string, key: string) => tx`insert into public.user_roles (user_id, role_id) select ${user}, id from public.roles where key = ${key}`;
      await grant(ids.super1, "SUPER_ADMIN");
      await grant(ids.super2, "SUPER_ADMIN");
      await grant(ids.admin, "ADMIN");
      await grant(ids.manager, "MANAGER");
      await grant(ids.staff, "STAFF");
      // A custom role that can manage users but holds little else
      const [hrRole] = await tx`insert into public.roles (key, name, is_system) values ('HR', 'HR', false) returning id`;
      await tx`insert into public.role_permissions (role_id, permission_key) values (${hrRole.id}, 'users.manage'), (${hrRole.id}, 'dashboard.view'), (${hrRole.id}, 'tasks.update')`;
      await grant(ids.hr, "HR");

      const as = async <T>(userId: string, fn: (t: Tx) => Promise<T>) =>
        tx.savepoint(async (sp) => {
          await sp.unsafe("set local role authenticated");
          await sp`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
          const result = await fn(sp as unknown as Tx);
          await sp.unsafe("reset role");
          await sp`select set_config('request.jwt.claims', '', true)`;
          return result;
        });
      const fails = async (userId: string, run: (t: Tx) => Promise<unknown>) => {
        try {
          await as(userId, run);
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      };
      /** Same as fails(), but as the service role / migrations (no signed-in user). */
      const failsAsSystem = async (run: (t: Tx) => Promise<unknown>) => {
        try {
          await tx.savepoint((sp) => run(sp as unknown as Tx));
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      };
      const ADMIN = await roleId("ADMIN");
      const SUPER = await roleId("SUPER_ADMIN");
      const MANAGER = await roleId("MANAGER");
      const STAFF = await roleId("STAFF");
      const SALES = await roleId("SALES");
      let err: string | null;

      // ── 1. No self-promotion ──
      err = await fails(ids.hr, (t) => t`insert into public.user_roles (user_id, role_id) values (${ids.hr}, ${ADMIN})`);
      expect("a users.manage holder can't give themselves Admin", !!err && /own roles/.test(err), err ?? "");
      err = await fails(ids.admin, (t) => t`insert into public.user_roles (user_id, role_id) values (${ids.admin}, ${SALES})`);
      expect("an Admin can't change their own roles", !!err && /own roles/.test(err), err ?? "");
      err = await fails(ids.admin, (t) => t`insert into public.user_roles (user_id, role_id) values (${ids.admin}, ${SUPER})`);
      expect("an Admin can't make themselves Super Admin", !!err, err ?? "");

      // ── 2. No escalation through roles or permissions ──
      err = await fails(ids.hr, (t) => t`insert into public.user_roles (user_id, role_id) values (${ids.fresh}, ${MANAGER})`);
      expect("HR can't grant a role with permissions HR lacks", !!err && /don't have yourself/.test(err), err ?? "");
      err = await fails(ids.hr, (t) => t`insert into public.user_roles (user_id, role_id) values (${ids.fresh}, ${STAFF})`);
      expect("HR can grant a role within its own permissions", err === null, err ?? "");
      err = await fails(ids.hr, (t) => t`delete from public.user_roles where user_id = ${ids.manager} and role_id = ${MANAGER}`);
      expect("HR can't strip a role that outranks it", !!err && /don't have yourself/.test(err), err ?? "");
      err = await fails(ids.hr, (t) => t`insert into public.role_permissions (role_id, permission_key) values (${hrRole.id}, 'payments.adjust')`);
      expect("HR can't add a permission it lacks to its own role", !!err && /don't have it yourself/.test(err), err ?? "");
      err = await fails(ids.hr, (t) => t`insert into public.role_permissions (role_id, permission_key) select ${STAFF}, 'customers.view'`);
      expect("HR can't add a permission it lacks to another role", !!err, err ?? "");
      err = await fails(ids.admin, (t) => t`insert into public.role_permissions (role_id, permission_key) values (${STAFF}, 'dashboard.view') on conflict do nothing`);
      expect("an Admin can add a permission they hold to a role", err === null, err ?? "");
      err = await fails(ids.admin, (t) => t`insert into public.user_roles (user_id, role_id) values (${ids.fresh}, ${MANAGER})`);
      expect("an Admin can grant Manager to someone else", err === null, err ?? "");
      err = await fails(ids.admin, (t) => t`delete from public.user_roles where user_id = ${ids.fresh} and role_id = ${MANAGER}`);
      expect("an Admin can remove Manager from someone else", err === null, err ?? "");

      // ── 3. Super Admin role and built-in roles ──
      err = await fails(ids.admin, (t) => t`delete from public.role_permissions where role_id = ${SUPER} and permission_key = 'reports.view'`);
      expect("an Admin can't remove permissions from Super Admin", !!err, err ?? "");
      err = await fails(ids.super1, (t) => t`delete from public.role_permissions where role_id = ${SUPER} and permission_key = 'reports.view'`);
      expect("even a Super Admin can't trim the Super Admin role", !!err && /every permission/.test(err), err ?? "");
      err = await fails(ids.super1, (t) => t`delete from public.role_permissions where role_id = ${ADMIN} and permission_key = 'users.manage'`);
      expect("Admin keeps Manage users & roles", !!err && /Manage users/.test(err), err ?? "");
      err = await fails(ids.admin, (t) => t`update public.roles set key = 'X' where id = ${MANAGER}`);
      expect("a built-in role's key can't be changed", !!err && /key/.test(err), err ?? "");
      err = await fails(ids.admin, (t) => t`update public.roles set is_system = false where id = ${MANAGER}`);
      expect("a built-in role can't be un-built-in", !!err, err ?? "");
      err = await fails(ids.admin, (t) => t`update public.roles set name = 'Ops Manager', description = 'x' where id = ${MANAGER}`);
      expect("a role can still be renamed", err === null, err ?? "");

      // ── 4. Always one active Super Admin ──
      err = await fails(ids.super1, (t) => t`delete from public.user_roles where user_id = ${ids.super2} and role_id = ${SUPER}`);
      expect("a Super Admin can remove another while one remains", err === null, err ?? "");
      err = await fails(ids.super1, (t) => t`delete from public.user_roles where user_id = ${ids.super1} and role_id = ${SUPER}`);
      expect("the last active Super Admin can't drop the role", !!err && /active Super Admin/.test(err), err ?? "");
      err = await failsAsSystem((t) => t`delete from public.user_roles where user_id = ${ids.super1} and role_id = ${SUPER}`);
      expect("…not even through the service role", !!err && /active Super Admin/.test(err), err ?? "");
      err = await failsAsSystem((t) => t`delete from auth.users where id = ${ids.super1}`);
      expect("…nor by deleting their account", !!err && /active Super Admin/.test(err), err ?? "");
      // super2 again, but suspended: an inactive Super Admin doesn't count
      await grant(ids.super2, "SUPER_ADMIN");
      err = await fails(ids.super1, (t) => t`update public.profiles set active = false where id = ${ids.super2}`);
      expect("a Super Admin can suspend another while one remains", err === null, err ?? "");
      err = await failsAsSystem((t) => t`update public.profiles set active = false where id = ${ids.super1}`);
      expect("the last active Super Admin can't be suspended (suspended ones don't count)", !!err && /active Super Admin/.test(err), err ?? "");
      err = await fails(ids.super1, (t) => t`delete from public.user_roles where user_id = ${ids.super2} and role_id = ${SUPER}`);
      expect("a suspended Super Admin's role can be removed", err === null, err ?? "");

      // ── 5. Self-suspension ──
      err = await fails(ids.admin, (t) => t`update public.profiles set active = false where id = ${ids.admin}`);
      expect("nobody suspends their own account", !!err && /own account/.test(err), err ?? "");
      err = await fails(ids.admin, (t) => t`update public.profiles set active = false where id = ${ids.manager}`);
      expect("an Admin can suspend a Manager", err === null, err ?? "");
      const seen = await as(ids.manager, (t) => t`select public.has_permission('customers.view') ok`);
      expect("a suspended login loses every permission", seen[0]!.ok === false);
      err = await fails(ids.admin, (t) => t`update public.profiles set active = true where id = ${ids.manager}`);
      expect("an Admin can reactivate a Manager", err === null, err ?? "");
      const back = await as(ids.manager, (t) => t`select public.has_permission('customers.view') ok`);
      expect("a reactivated login gets its permissions back", back[0]!.ok === true);

      // ── Existing Phase 3 flows still work ──
      const [s] = await tx`insert into public.staff (name, email) values ('Field', 'field@p6.test') returning id`;
      err = await fails(ids.admin, (t) => t`select public.link_staff_login(${s.id}, ${ids.fresh}, 'STAFF')`);
      expect("link_staff_login still grants Staff", err === null, err ?? "");
      err = await fails(ids.admin, (t) => t`select public.set_staff_login_active(${s.id}, false)`);
      expect("set_staff_login_active still suspends", err === null, err ?? "");
      err = await fails(ids.staff, (t) => t`insert into public.user_roles (user_id, role_id) values (${ids.staff}, ${ADMIN})`);
      expect("a field login can't grant itself anything", !!err, err ?? "");

      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });

  console.log(`Phase 6 tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  await sql.end();
  if (failures.length) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
