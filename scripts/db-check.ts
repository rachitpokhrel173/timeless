/**
 * Fails if src/db/schema.ts has drifted from the database built by supabase/migrations.
 *
 *   npm run db:check
 *
 * Runs drizzle-kit's diff (nothing is applied — stdin is closed so it can't be confirmed) and
 * ignores what drizzle doesn't model (RLS, policies, triggers) plus known formatting noise.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npx drizzle-kit push --verbose --strict", {
  encoding: "utf8",
  input: "",
  shell: true,
  timeout: 180_000,
});
const output = `${result.stdout}\n${result.stderr}`;
const statements = output
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => /^(ALTER|CREATE|DROP)\b/.test(l));

const NOISE = [
  /ROW LEVEL SECURITY/,
  /POLICY/,
  /ALTER COLUMN "\w+" SET DEFAULT/, // array/numeric default formatting
  /CONSTRAINT "\w{63,}"/, // FK names Postgres truncated to 63 chars
];
const drift = statements.filter((s) => !NOISE.some((re) => re.test(s)));

if (!statements.length && !/No changes detected|Changes applied/.test(output)) {
  console.error("Could not compare schemas:\n", output.slice(-2000));
  process.exit(2);
}
if (drift.length) {
  console.error("schema.ts and the migrations differ:\n  " + drift.join("\n  "));
  process.exit(1);
}
console.log("schema.ts matches the migrated database.");
