/**
 * Apply supabase/migrations/*.sql in order against DATABASE_URL.
 *
 *   npm run db:migrate            apply pending migrations
 *   npm run db:migrate -- --seed  also run supabase/seed.sql afterwards
 *
 * Applied versions are recorded in supabase_migrations.schema_migrations — the same table the
 * Supabase CLI uses — so `supabase db push` and this script agree on what's been applied.
 * You can use either this script or `supabase db push`.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const args = process.argv.slice(2);

async function main() {
  const sql = postgres(url!, { max: 1, onnotice: () => {}, prepare: false });
  try {
    await sql.unsafe(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
    `);
    const applied = new Set((await sql`select version from supabase_migrations.schema_migrations`).map((r) => r.version as string));
    const dir = join("supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    let count = 0;
    for (const file of files) {
      const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
      if (applied.has(version)) continue;
      const body = readFileSync(join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into supabase_migrations.schema_migrations (version, name, statements) values (${version}, ${rest.join("_")}, ${[body]})`;
      });
      console.log(`· Applied ${file}`);
      count++;
    }
    console.log(count ? `Migrations applied (${count}).` : "Database is up to date.");

    if (args.includes("--seed") && existsSync(join("supabase", "seed.sql"))) {
      await sql.unsafe(readFileSync(join("supabase", "seed.sql"), "utf8"));
      console.log("· Seed data loaded (supabase/seed.sql)");
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  if (error.position) console.error("at position", error.position);
  process.exit(1);
});
