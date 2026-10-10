import "server-only";
import { adminDb, schema, tbl, total } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { unreadCount } from "./notifications";

/** Header/sidebar badges: unread notifications and new (unread) inquiries. */
export async function headerCounts(user: SessionUser) {
  const [notifications, inquiries] = await Promise.all([
    unreadCount(user),
    user.permissions.has("leads.view")
      ? total(adminDb.from(tbl(schema.inquiries)).select("id", { count: "exact", head: true }).is("read_at", null).is("archived_at", null).eq("spam", false))
      : 0,
  ]);
  return { notifications, inquiries };
}
