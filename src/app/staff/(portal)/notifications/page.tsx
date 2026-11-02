import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { listParams } from "@/lib/list";
import { listNotifications, unreadCount } from "@/server/notifications";
import { portalHref, requireStaffUser } from "@/server/staff-portal";
import { buttonClass, Card, EmptyState, hrefWith } from "@/components/admin/ui";
import NotificationList, { MarkAllRead } from "@/app/admin/(panel)/notifications/NotificationList";

export const metadata: Metadata = { title: "Notifications" };

/** The team member's own notifications (filtered by the same rules as the admin list), linking into the portal. */
export default async function StaffNotificationsPage({ searchParams }: PageProps<"/staff/notifications">) {
  const user = await requireStaffUser();
  const sp = await searchParams;
  const { page, pageSize, offset } = listParams(sp, 30);
  const [items, unread] = await Promise.all([listNotifications(user, { limit: pageSize + 1, offset }), unreadCount(user)]);
  const hasMore = items.length > pageSize;
  const shown = items.slice(0, pageSize).map((n) => ({ ...n, href: portalHref(n.href, user) }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-medium">Notifications</h1>
          <p className="mt-1 text-[14px] text-a-muted">New tasks, changes to your work and replies from the office.</p>
        </div>
        <MarkAllRead disabled={unread === 0} />
      </div>
      <Card bodyClassName="p-0">
        {shown.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet">
            Notifications from the last 90 days appear here.
          </EmptyState>
        ) : (
          <NotificationList items={shown} />
        )}
        {(page > 1 || hasMore) && (
          <nav aria-label="Pagination" className="flex justify-between gap-2 px-3 py-3">
            {page > 1 ? (
              <Link href={hrefWith("/staff/notifications", sp, { page: page - 1 })} className={buttonClass("secondary", "sm")} rel="prev">
                Newer
              </Link>
            ) : (
              <span />
            )}
            {hasMore && (
              <Link href={hrefWith("/staff/notifications", sp, { page: page + 1 })} className={buttonClass("secondary", "sm")} rel="next">
                Older
              </Link>
            )}
          </nav>
        )}
      </Card>
    </>
  );
}
