import "server-only";
import { adminDb, afterCommit, all, exec, inUserContext, many, pgrstValue, schema, tbl, vals } from "@/db";
import type { SessionUser } from "@/lib/auth/session";

export type NotifyInput = {
  type: string;
  title: string;
  body?: string;
  href?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  entityType?: string;
  entityId?: string;
  /** Only users with this permission see it. */
  permission?: string;
  /** Send to one user only. */
  userId?: string | null;
  /** The same key is raised once. */
  dedupeKey?: string;
};

/**
 * Raise an in-app notification (system write; duplicates by dedupe key are ignored).
 * Admin screens receive it instantly through Supabase Realtime and the header badge.
 */
export async function notify(input: NotifyInput) {
  // Inside a user action, only raise it once the action has succeeded
  if (inUserContext()) {
    afterCommit(() => insertNotification(input));
    return;
  }
  await insertNotification(input);
}

async function insertNotification(input: NotifyInput) {
  const values = vals(schema.notifications, {
    type: input.type,
    title: input.title,
    body: input.body,
    href: input.href,
    priority: input.priority ?? "MEDIUM",
    entityType: input.entityType,
    entityId: input.entityId,
    permission: input.permission,
    userId: input.userId ?? null,
    dedupeKey: input.dedupeKey,
  });
  const table = adminDb.from(tbl(schema.notifications));
  await exec(input.dedupeKey ? table.upsert(values, { onConflict: "dedupe_key", ignoreDuplicates: true }) : table.insert(values));
}

const nt = tbl(schema.notifications);
type Filterable<Q> = { or(filters: string): Q; gt(column: string, value: string): Q };

/** Mirrors the "recipient reads" RLS policy, for privileged server-side reads. */
export function visibleTo<Q extends Filterable<Q>>(query: Q, user: SessionUser): Q {
  const perms = [...user.permissions];
  const permFilter = perms.length ? `permission.is.null,permission.in.(${perms.map(pgrstValue).join(",")})` : "permission.is.null";
  return query
    .or(permFilter)
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .gt("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString());
}

async function readIds(user: SessionUser) {
  const rows = await all<{ id: string }>(() =>
    adminDb
      .from(tbl(schema.notificationReads))
      .select("id:notification_id")
      .eq("user_id", user.id)
      .gt("read_at", new Date(Date.now() - 91 * 86_400_000).toISOString())
      .order("notification_id"),
  );
  return new Set(rows.map((r) => r.id));
}

async function visibleIds(user: SessionUser) {
  return all<{ id: string }>(() => visibleTo(adminDb.from(nt).select("id"), user).order("id"));
}

export async function unreadCount(user: SessionUser) {
  const [visible, read] = await Promise.all([visibleIds(user), readIds(user)]);
  return visible.filter((n) => !read.has(n.id)).length;
}

export async function listNotifications(user: SessionUser, opts: { onlyUnread?: boolean; limit?: number; offset?: number } = {}) {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const rows = await many<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    href: string | null;
    priority: string;
    createdAt: Date;
    reads: { readAt: Date }[];
  }>(
    visibleTo(adminDb.from(nt).select("id,type,title,body,href,priority,createdAt:created_at,reads:notification_reads(readAt:read_at)"), user)
      .eq("reads.user_id", user.id)
      .order("created_at", { ascending: false })
      .range(opts.onlyUnread ? 0 : offset, opts.onlyUnread ? 999 : offset + limit - 1),
  );
  const list = rows.map(({ reads, ...n }) => ({ ...n, readAt: reads[0]?.readAt ?? null }));
  return opts.onlyUnread ? list.filter((n) => !n.readAt).slice(offset, offset + limit) : list;
}

export async function markRead(user: SessionUser, ids: string[] | "all") {
  let targets = ids === "all" ? [] : ids;
  if (ids === "all") {
    const [visible, read] = await Promise.all([visibleIds(user), readIds(user)]);
    targets = visible.map((n) => n.id).filter((id) => !read.has(id));
  }
  if (!targets.length) return;
  await exec(
    adminDb.from(tbl(schema.notificationReads)).upsert(
      targets.map((notificationId) => ({ notification_id: notificationId, user_id: user.id })),
      { onConflict: "notification_id,user_id", ignoreDuplicates: true },
    ),
  );
}
