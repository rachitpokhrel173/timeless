/**
 * Phase 5 (website CMS) database checks — run against a throw-away database built from
 * supabase/migrations (never production):
 *
 *   DATABASE_URL=postgres://…localhost… npx tsx scripts/test-phase5.ts
 *
 * Everything happens inside one transaction that is rolled back.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { randomUUID } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL!;
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("test-phase5 only runs against a local test database.");
const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: false });
type Tx = postgres.TransactionSql;

let passed = 0;
const failures: string[] = [];
const expect = (name: string, ok: boolean, detail = "") => (ok ? passed++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`));
class Rollback extends Error {}

async function main() {
  await sql
    .begin(async (tx) => {
      const ids = { editor: randomUUID(), sales: randomUUID(), viewer: randomUUID() };
      for (const [k, id] of Object.entries(ids)) await tx`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${k}@p5.test`}, ${tx.json({ full_name: k })})`;
      await tx`insert into public.user_roles (user_id, role_id) select ${ids.editor}, id from public.roles where key = 'EDITOR'`;
      await tx`insert into public.user_roles (user_id, role_id) select ${ids.sales}, id from public.roles where key = 'SALES'`;

      const owner = async () => {
        await tx.unsafe("reset role");
        await tx`select set_config('request.jwt.claims', '', true)`;
      };
      const as = async <T>(role: "anon" | "authenticated", userId: string | null, fn: (t: Tx) => Promise<T>) =>
        tx.savepoint(async (sp) => {
          await sp.unsafe(`set local role ${role}`);
          await sp`select set_config('request.jwt.claims', ${JSON.stringify(userId ? { sub: userId, role } : { role: "anon" })}, true)`;
          return fn(sp as unknown as Tx);
        });
      const fails = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
          return false;
        } catch {
          return true;
        } finally {
          await owner();
        }
      };
      const count = async (t: Tx, q: string) => Number((await t.unsafe(q))[0].c);

      // ───── Drafts & history are staff-only ─────
      await tx`insert into public.cms_drafts (scope, key, content) values ('section', 'p5-hero', '{"title":"secret draft"}')`;
      expect("anon cannot read drafts", await fails(() => as("anon", null, (t) => t`select * from public.cms_drafts`)));
      expect("anon cannot read history", await fails(() => as("anon", null, (t) => t`select * from public.cms_revisions`)));
      expect("anon cannot read testimonial notes", await fails(() => as("anon", null, (t) => t`select * from public.testimonial_notes`)));
      expect("sales (no CMS) sees no drafts", (await as("authenticated", ids.sales, (t) => count(t, "select count(*)::int c from public.cms_drafts"))) === 0);
      await owner();
      expect("editor sees drafts", (await as("authenticated", ids.editor, (t) => count(t, "select count(*)::int c from public.cms_drafts where key = 'p5-hero'"))) === 1);
      await owner();
      expect("sales cannot write drafts", await fails(() => as("authenticated", ids.sales, (t) => t`insert into public.cms_drafts (scope, key, content) values ('section', 'x', '{}')`)));
      expect("draft scope is checked", await fails(() => tx.savepoint((sp) => sp`insert into public.cms_drafts (scope, key, content) values ('bogus', 'x', '{}')`)));

      // ───── Revisions are append-only and attributed ─────
      expect(
        "editor records a revision as themself",
        !(await fails(() => as("authenticated", ids.editor, (t) => t`insert into public.cms_revisions (scope, key, action, actor_id) values ('section', 'p5-hero', 'PUBLISH', ${ids.editor})`))),
      );
      expect("cannot record a revision as someone else", await fails(() => as("authenticated", ids.editor, (t) => t`insert into public.cms_revisions (scope, key, action, actor_id) values ('section', 'p5-hero', 'PUBLISH', ${ids.sales})`)));
      expect("sales cannot record revisions", await fails(() => as("authenticated", ids.sales, (t) => t`insert into public.cms_revisions (scope, key, action, actor_id) values ('section', 'p5-hero', 'PUBLISH', ${ids.sales})`)));
      const edited = await as("authenticated", ids.editor, async (t) => (await t`update public.cms_revisions set note = 'x' where key = 'p5-hero' returning id`).length).catch(() => 0);
      await owner();
      expect("history cannot be edited", edited === 0 && (await count(tx, "select count(*)::int c from public.cms_revisions where key = 'p5-hero' and note is null")) === 1);
      const deleted = await as("authenticated", ids.editor, async (t) => (await t`delete from public.cms_revisions where key = 'p5-hero' returning id`).length).catch(() => 0);
      await owner();
      expect("history cannot be deleted", deleted === 0 && (await count(tx, "select count(*)::int c from public.cms_revisions where key = 'p5-hero'")) === 1);

      // ───── Testimonials: approval + consent before publishing (database backstop) ─────
      expect("cannot publish a pending testimonial", await fails(() => tx.savepoint((sp) => sp`insert into public.testimonials (customer_name, event_type, quote, status, consent) values ('P', 'W', 'q', 'PUBLISHED', true)`)));
      expect(
        "cannot publish without consent",
        await fails(() => tx.savepoint((sp) => sp`insert into public.testimonials (customer_name, event_type, quote, status, consent, review_status) values ('P', 'W', 'q', 'PUBLISHED', false, 'APPROVED')`)),
      );
      const [t1] = await tx`insert into public.testimonials (customer_name, event_type, quote, consent) values ('Real client', 'Wedding', 'Lovely', true) returning id, review_status, reviewed_at`;
      expect("new testimonials start pending", t1.review_status === "PENDING" && t1.reviewed_at === null);
      expect("cannot skip approval", await fails(() => tx.savepoint((sp) => sp`update public.testimonials set status = 'PUBLISHED' where id = ${t1.id}`)));
      const [t2] = await tx`update public.testimonials set review_status = 'APPROVED' where id = ${t1.id} returning reviewed_at`;
      expect("approving stamps reviewed_at", t2.reviewed_at !== null);
      expect("approved + consent publishes", !(await fails(() => tx.savepoint((sp) => sp`update public.testimonials set status = 'PUBLISHED' where id = ${t1.id}`))));
      await tx`insert into public.testimonials (customer_name, event_type, quote, consent, review_status) values ('Rejected one', 'Wedding', 'meh', true, 'REJECTED')`;
      await tx`insert into public.testimonial_notes (testimonial_id, notes) values (${t1.id}, 'consent by phone')`;
      const publicRows = await as("anon", null, (t) => t`select customer_name from public.testimonials`);
      await owner();
      const names = publicRows.map((r) => r.customer_name as string);
      expect("public sees the approved testimonial", names.includes("Real client"), names.join(","));
      expect("public never sees rejected/pending", !names.includes("Rejected one"));

      // ───── Packages: snapshots and add-ons ─────
      const [pkg] = await tx`insert into public.packages (slug, name, price, status) values ('p5-pkg', 'Signature', 200000, 'PUBLISHED') returning id`;
      expect("add-ons must be a list", await fails(() => tx.savepoint((sp) => sp`update public.packages set add_ons = '{"a":1}' where id = ${pkg.id}`)));
      const snap = { id: pkg.id, name: "Signature", price: 200000, priceFrom: true, takenAt: new Date().toISOString(), items: [{ label: "Stage", quantity: 1, inventoryItemId: null }], addOns: [] };
      const [cust] = await tx`insert into public.customers (name, phone) values ('Snap', '9800000099') returning id`;
      const [q] = await tx`insert into public.quotations (number, customer_id, title, status, public_token, total, package_id, package_snapshot) values ('QT-P5-1', ${cust.id}, 'Q', 'SENT', ${randomUUID()}, 200000, ${pkg.id}, ${tx.json(snap)}) returning id`;
      await tx`update public.packages set price = 999999, name = 'Changed' where id = ${pkg.id}`;
      await tx`delete from public.packages where id = ${pkg.id}`;
      const [after] = await tx`select package_id, package_snapshot from public.quotations where id = ${q.id}`;
      expect("quotation keeps its package copy after the package changes or is deleted", after.package_snapshot?.price === 200000 && after.package_snapshot?.name === "Signature", JSON.stringify(after.package_snapshot));
      expect("deleting a package leaves the quotation", after.package_id === null);

      // ───── Media provenance, SEO, services ─────
      const [orig] = await tx`insert into public.media (bucket, path, filename, mime) values ('event-media', ${`events/${randomUUID()}/work/a.webp`}, 'a.webp', 'image/webp') returning id`;
      await tx`insert into public.media (bucket, path, filename, mime, source_media_id) values ('public-media', 'gallery/c1.webp', 'c1.webp', 'image/webp', ${orig.id})`;
      expect("an event photo gets one website copy", await fails(() => tx.savepoint((sp) => sp`insert into public.media (bucket, path, filename, mime, source_media_id) values ('public-media', 'gallery/c2.webp', 'c2.webp', 'image/webp', ${orig.id})`)));
      const privateVisible = await as("anon", null, (t) => count(t, `select count(*)::int c from public.media where id = '${orig.id}'`));
      await owner();
      expect("the private original stays hidden from the public", privateVisible === 0);
      expect("canonical must be a site path", await fails(() => tx.savepoint((sp) => sp`insert into public.seo_settings (path, canonical_path) values ('/p5-test', 'https://evil.example')`)));
      expect("canonical path accepted", !(await fails(() => tx.savepoint((sp) => sp`insert into public.seo_settings (path, canonical_path) values ('/p5-test2', '/services')`))));
      expect("starting price can't be negative", await fails(() => tx.savepoint((sp) => sp`insert into public.services (slug, name, summary, description, starting_price) values ('p5-neg', 'N', 's', 'd', -1)`)));

      // ───── About backfill keeps the page as it was ─────
      const [about] = await tx`select value from public.site_settings where key = 'about'`;
      if (about) expect("about setting has the team block", !!about.value?.team?.heading, JSON.stringify(about.value).slice(0, 120));

      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
  await sql.end();
  console.log(`Phase 5 tests: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
