/**
 * Local development database: a real PostgreSQL server (same SQL as Supabase in production),
 * run from npm without Docker. Data lives in .data/postgres and survives restarts.
 *
 *   npm run db:local     start it (keep the terminal open)
 *
 * Then use DATABASE_URL=postgres://postgres:postgres@localhost:54329/timeless in .env.local
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { join } from "node:path";

const dataDir = join(process.cwd(), ".data", "postgres");
const port = Number(process.env.LOCAL_DB_PORT ?? 54329);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  // Match Supabase: UTF-8 with a neutral collation (Windows would otherwise default to WIN1252)
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

async function main() {
  const fresh = !existsSync(join(dataDir, "PG_VERSION"));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase("timeless");
  console.log(`Local Postgres ready on port ${port} — postgres://postgres:postgres@localhost:${port}/timeless`);
  const stop = async () => {
    await pg.stop();
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
