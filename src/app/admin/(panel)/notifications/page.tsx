import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { listParams } from "@/lib/list";
import { listNotifications, unreadCount } from "@/server/notifications";
import { buttonClass, Card, EmptyState, hrefWith, PageHeader, Tabs } from "@/components/admin/ui";
import NotificationList, { MarkAllRead } from "./NotificationList";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: PageProps<"/admin/notifications">) {
  const user = await requirePage();
  const sp = await searchParams;
  const { page, pageSize, offset, str } = listParams(sp, 40);
  const onlyUnread = str("show") === "unread";
  const [items, unread] = await Promise.all([listNotifications(user, { onlyUnread, limit: pageSize + 1, offset }), unreadCount(user)]);
  const hasMore = items.length > pageSize;

  return (
    <>
      <PageHeader title="Notifications" description="New inquiries, accepted quotes, payments, low stock and overdue work — arriving live." actions={<MarkAllRead disabled={unread === 0} />} />
      <Tabs
        active={onlyUnread ? "unread" : "all"}
        items={[
          { key: "all", label: "All", href: "/admin/notifications" },
          { key: "unread", label: "Unread", href: "/admin/notifications?show=unread", count: unread },
        ]}
      />
      <Card bodyClassName="p-0">
        {items.length === 0 ? (
          <EmptyState icon={Bell} title={onlyUnread ? "You're all caught up" : "No notifications yet"}>
            Notifications from the last 90 days appear here.
          </EmptyState>
        ) : (
          <NotificationList items={items.slice(0, pageSize)} />
        )}
        {(page > 1 || hasMore) && (
          <nav aria-label="Pagination" className="flex justify-between gap-2 px-3 py-3">
            {page > 1 ? (
              <Link href={hrefWith("/admin/notifications", sp, { page: page - 1 })} className={buttonClass("secondary", "sm")} rel="prev">
                Newer
              </Link>
            ) : (
              <span />
            )}
            {hasMore && (
              <Link href={hrefWith("/admin/notifications", sp, { page: page + 1 })} className={buttonClass("secondary", "sm")} rel="next">
                Older
              </Link>
            )}
          </nav>
        )}
      </Card>
    </>
  );
}
