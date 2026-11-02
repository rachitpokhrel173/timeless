/**
 * Throw-away PostgreSQL for testing migrations — never touches .data/postgres or Supabase.
 *
 *   npx tsx scripts/test-db.ts            start a fresh server (keep it running)
 *
 * Every start wipes the previous test database, applies scripts/sql/local-supabase-shim.sql
 * (roles, auth.users, storage stand-ins) and leaves an empty "timeless" database ready for
 *
 *   DATABASE_URL=postgres://postgres:postgres@localhost:54339/timeless npm run db:migrate
 *   DATABASE_URL=… npm run test:rls
 *   DATABASE_URL=… npx tsx scripts/test-phase1.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const port = Number(process.env.TEST_DB_PORT ?? 54339);
const dataDir = process.env.TEST_DB_DIR ?? join(tmpdir(), "timeless-test-db");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

async function main() {
  rmSync(dataDir, { recursive: true, force: true });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("timeless");
  const sql = postgres(`postgres://postgres:postgres@localhost:${port}/timeless`, { max: 1, onnotice: () => {} });
  await sql.unsafe(readFileSync(join("scripts", "sql", "local-supabase-shim.sql"), "utf8"));
  await sql.end();
  console.log(`Test Postgres ready — postgres://postgres:postgres@localhost:${port}/timeless`);
  const stop = async () => {
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch(async (error) => {
  console.error(error);
  await pg.stop().catch(() => {});
  process.exit(1);
});
