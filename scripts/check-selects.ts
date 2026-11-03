/**
 * Runs every PostgREST select string in src/ against the configured Supabase API with limit 0 —
 * no rows are read or changed. Catches embeds that break when a new foreign key makes a
 * relationship ambiguous (PGRST201), renamed columns and missing tables, before a page 500s.
 *
 *   npx tsx scripts/check-selects.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import * as schema from "../src/db/schema";

const S = schema as unknown as Record<string, Parameters<typeof getTableName>[0]>;
const cols = (t: string, keys?: string[]) => {
  const all = getTableColumns(S[t]) as Record<string, { name: string }>;
  return (keys ?? Object.keys(all)).map((k) => (all[k]!.name === k ? k : `${k}:${all[k]!.name}`)).join(",");
};
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
walk("src");
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let run = 0, skipped = 0, bad = 0;
const seen = new Set<string>();
(async () => {
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const re = /\.from\((?:tbl\(schema\.(\w+)\)|"(\w+)")\)\s*\.select\(\s*(`[^`]*`|"[^"]*")/g;
    for (const m of src.matchAll(re)) {
      const table = m[1] ? getTableName(S[m[1]]) : m[2]!;
      let q = m[3]!.slice(1, -1);
      q = q.replace(/\$\{cols\(schema\.(\w+)(?:,\s*(\[[^\]]*\]))?\)\}/g, (_, t, k) => cols(t, k ? JSON.parse(k.replace(/'/g, '"')) : undefined));
      if (q.includes("${")) { skipped++; continue; }
      const key = `${table}|${q}`;
      if (seen.has(key)) continue;
      seen.add(key);
      run++;
      const { error } = await c.from(table).select(q).limit(0);
      if (error) { bad++; const line = src.slice(0, m.index).split("\n").length; console.log(`✗ ${f}:${line} [${table}] ${error.code} ${error.message.slice(0, 140)}`); }
    }
  }
  console.log(`checked ${run} distinct selects, ${bad} failing, ${skipped} skipped (dynamic)`);
})();
