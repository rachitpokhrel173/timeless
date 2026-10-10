"use client";

import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { fmtDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionButton, useRun } from "@/components/admin/interactive";
import { Badge } from "@/components/admin/ui";
import { markNotificationsRead } from "./actions";

export type NotificationItem = { id: string; type: string; title: string; body: string | null; href: string | null; priority: string; createdAt: Date; readAt: Date | null };

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  return (
    <ActionButton icon={CheckCheck} disabled={disabled} action={() => markNotificationsRead("all")} success="All caught up">
      Mark all read
    </ActionButton>
  );
}

export default function NotificationList({ items }: { items: NotificationItem[] }) {
  const { run } = useRun();
  return (
    <ul className="divide-y divide-a-border">
      {items.map((n) => {
        const body = (
          <>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-a-accent")} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className={cn("block", !n.readAt && "font-semibold")}>{n.title}</span>
              {n.body && <span className="mt-0.5 block text-[13px] text-a-muted">{n.body}</span>}
              <span className="mt-1 block text-xs text-a-muted" title={fmtDateTime(n.createdAt)}>
                {relativeTime(n.createdAt)} · {n.type.replace(/[._]/g, " ")}
              </span>
            </span>
            {["HIGH", "URGENT"].includes(n.priority) && <Badge tone={n.priority === "URGENT" ? "danger" : "warning"}>{n.priority === "URGENT" ? "Urgent" : "High"}</Badge>}
            {!n.readAt && <span className="sr-only">Unread</span>}
          </>
        );
        const cls = "flex items-start gap-3 px-4 py-3 hover:bg-a-subtle/60";
        const markOne = () => !n.readAt && run(() => markNotificationsRead([n.id]));
        return (
          <li key={n.id}>
            {n.href ? (
              <Link href={n.href} className={cls} onClick={markOne}>
                {body}
              </Link>
            ) : (
              <button type="button" className={cn(cls, "w-full text-left")} onClick={markOne}>
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
