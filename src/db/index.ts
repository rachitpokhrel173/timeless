import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getTableColumns, getTableName, is, type Table } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";
import * as schema from "./schema";

/*
 * Database access — everything goes through the Supabase API (PostgREST), no direct Postgres
 * connection. Two clients:
 *
 *   db         — inside withUser(): the signed-in user's Supabase client (their session JWT),
 *                so Row Level Security applies. Admin server actions run this way automatically
 *                (see lib/actions.ts). Outside a user context it falls back to adminDb.
 *   adminDb    — the service-role client, bypassing RLS. Only for system work: automations,
 *                cron jobs, validated public-form intake, auth bookkeeping, and admin page
 *                reads that have already passed a server-side permission check.
 *
 * Tables are described by ./schema (TypeScript names in camelCase, columns in snake_case).
 * Selects alias every column to its camelCase name (cols()), writes map back (vals()), and
 * results come back with timestamps as Date objects — the same shapes the app always used.
 * There are no multi-statement transactions: a write sequence stops at the first error.
 */

export type DB = SupabaseClient;
/** Kept so existing signatures read the same; a "transaction" is just a client now. */
export type Tx = DB;

type Context = {
  client: DB;
  afterCommit: (() => Promise<unknown> | unknown)[];
};
const context = new AsyncLocalStorage<Context>();

const lazy = (get: () => DB): DB =>
  new Proxy({} as DB, {
    get(_target, prop) {
      const client = get();
      const value = Reflect.get(client, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });

/** Service-role client — bypasses RLS. Never use it for work done on a user's behalf without a permission check. */
export const adminDb: DB = lazy(() => supabaseAdmin() as DB);

/** The current user's client inside withUser(), otherwise the service-role client. */
export const db: DB = lazy(() => context.getStore()?.client ?? (supabaseAdmin() as DB));

/**
 * Run `fn` as the signed-in Supabase user (session from cookies). Row Level Security applies to
 * every query made through `db` inside it. Callbacks registered with afterCommit() run once `fn`
 * has finished without throwing (notifications, emails, automations).
 */
export async function withUser<T>(fn: () => Promise<T>): Promise<T> {
  const pending: Context["afterCommit"] = [];
  const client = (await supabaseServer()) as unknown as DB;
  const result = await context.run({ client, afterCommit: pending }, fn);
  for (const job of pending) {
    try {
      await job();
    } catch (error) {
      console.error("[afterCommit]", error);
    }
  }
  return result;
}

let anonClient: DB | undefined;
/** Run as an anonymous website visitor (RLS: published content only). */
export async function asAnon<T>(fn: (conn: DB) => Promise<T>): Promise<T> {
  anonClient ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return fn(anonClient);
}

/** Schedule work for after the current user action succeeds (or run it now outside one). */
export function afterCommit(job: () => Promise<unknown> | unknown) {
  const store = context.getStore();
  if (store) store.afterCommit.push(job);
  else
    void Promise.resolve()
      .then(job)
      .catch((e) => console.error("[afterCommit]", e));
}

export const inUserContext = () => !!context.getStore();
export { schema };

/* ───────────────────────── Table ↔ API mapping ───────────────────────── */

type AnyTable = Table;
export type Row<T extends AnyTable> = T["$inferSelect"];
export type NewRow<T extends AnyTable> = T["$inferInsert"];

const TIMESTAMP_KEYS = new Set<string>();
const JSON_KEYS = new Set<string>();
for (const value of Object.values(schema)) {
  if (!is(value, PgTable)) continue;
  for (const [key, column] of Object.entries(getTableColumns(value))) {
    if (column.columnType === "PgTimestamp") TIMESTAMP_KEYS.add(key);
    if (column.columnType === "PgJsonb" || column.columnType === "PgJson") JSON_KEYS.add(key);
  }
}

/** Table name for .from(). */
export const tbl = (table: AnyTable) => getTableName(table);

/** Column name for filters and ordering: col(schema.leads, "createdAt") → "created_at". */
export function col<T extends AnyTable>(table: T, key: keyof Row<T> & string) {
  const column = (getTableColumns(table) as Record<string, { name: string }>)[key];
  if (!column) throw new Error(`Unknown column ${tbl(table)}.${key}`);
  return column.name;
}

/** Select list aliasing columns to their camelCase keys: "id,fullName:full_name,…". */
export function cols<T extends AnyTable>(table: T, keys?: (keyof Row<T> & string)[]) {
  const all = getTableColumns(table) as Record<string, { name: string }>;
  return (keys ?? Object.keys(all))
    .map((key) => {
      const name = all[key]?.name;
      if (!name) throw new Error(`Unknown column ${tbl(table)}.${key}`);
      return name === key ? key : `${key}:${name}`;
    })
    .join(",");
}

function toColumns(table: AnyTable, values: Record<string, unknown>) {
  const all = getTableColumns(table) as Record<string, { name: string }>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const name = all[key]?.name;
    if (!name) throw new Error(`Unknown column ${tbl(table)}.${key}`);
    out[name] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/** camelCase values → API row(s) with snake_case columns (undefined keys are left out). */
export function vals<T extends AnyTable>(table: T, values: Partial<NewRow<T>>): Record<string, unknown>;
export function vals<T extends AnyTable>(table: T, values: Partial<NewRow<T>>[]): Record<string, unknown>[];
export function vals(table: AnyTable, values: Record<string, unknown> | Record<string, unknown>[]) {
  return Array.isArray(values) ? values.map((v) => toColumns(table, v)) : toColumns(table, values);
}

/** Timestamps → Date, recursively through embedded rows (never inside JSON columns). */
function parse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(parse);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (TIMESTAMP_KEYS.has(key) && typeof v === "string") out[key] = new Date(v);
    else if (JSON_KEYS.has(key)) out[key] = v;
    else out[key] = parse(v);
  }
  return out;
}

/* ───────────────────────── Results ───────────────────────── */

/** A failed API call. `code` is the Postgres error code when there is one (23505, 42501…). */
export class DbError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: string,
  ) {
    super(message);
  }
}

type Res = {
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
  count?: number | null;
};

function check(res: Res) {
  if (res.error) throw new DbError(res.error.message, res.error.code, res.error.details);
}

/** All rows of a query. */
export async function many<R = Record<string, unknown>>(query: PromiseLike<Res>): Promise<R[]> {
  const res = await query;
  check(res);
  return (parse(res.data ?? []) as R[]) ?? [];
}

/** The first row (or the single object) of a query, or null. */
export async function maybe<R = Record<string, unknown>>(query: PromiseLike<Res>): Promise<R | null> {
  const res = await query;
  check(res);
  const data = Array.isArray(res.data) ? res.data[0] : res.data;
  return (data ? parse(data) : null) as R | null;
}

/** Like maybe() but the row must exist. */
export async function one<R = Record<string, unknown>>(query: PromiseLike<Res>): Promise<R> {
  const row = await maybe<R>(query);
  if (!row) throw new DbError("Expected a row but none was returned");
  return row;
}

/** Run a write with no result needed. */
export async function exec(query: PromiseLike<Res>): Promise<void> {
  check(await query);
}

/** Row count of a `select("id", { count: "exact", head: true })` query. */
export async function total(query: PromiseLike<Res>): Promise<number> {
  const res = await query;
  check(res);
  return res.count ?? 0;
}

/** Rows plus the total match count of a `select(…, { count: "exact" })` query (list pages). */
export async function paged<R = Record<string, unknown>>(query: PromiseLike<Res>): Promise<{ rows: R[]; total: number }> {
  const res = await query;
  check(res);
  return { rows: (parse(res.data ?? []) as R[]) ?? [], total: res.count ?? 0 };
}

/** Call a database function. */
export async function rpc<R = unknown>(conn: DB, fn: string, args: Record<string, unknown> = {}): Promise<R> {
  const res = await conn.rpc(fn, args);
  check(res as Res);
  return parse(res.data) as R;
}

/**
 * Every row of a query, fetched in pages (the API returns at most 1,000 rows per request).
 * `build` must return a fresh, ordered query each time.
 */
export async function all<R = Record<string, unknown>>(build: () => { range(from: number, to: number): PromiseLike<Res> }, pageSize = 1000): Promise<R[]> {
  const out: R[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await many<R>(build().range(from, from + pageSize - 1));
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}

/** Escape a value for use inside a PostgREST or()/ilike filter. */
export const pgrstValue = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
export const likeEscape = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);
