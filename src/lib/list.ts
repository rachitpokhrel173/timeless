/** Parse common list params from searchParams: ?q=&page=&sort= */
export function listParams(sp: Record<string, string | string[] | undefined>, pageSize = 25) {
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const page = Math.max(1, Number.parseInt(str("page") ?? "1", 10) || 1);
  const q = str("q")?.trim().slice(0, 100) || undefined;
  return { page, pageSize, offset: (page - 1) * pageSize, q, str };
}

/** Escape LIKE wildcards in user input. */
export const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Route params that should be a record id. */
export const isUuid = (v: string | undefined | null): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v);

/** An embedded relation that PostgREST may return as an object (one-to-one) or an array. */
export const first = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
