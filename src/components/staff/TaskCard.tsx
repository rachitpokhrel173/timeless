import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, MapPin } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PortalTask } from "@/server/staff-portal";
import { PRIORITY, StatusBadge, TASK_STATUS } from "@/components/admin/status";

/** One assigned task in the staff portal: a big, tappable row with what matters on site. */
export default function TaskCard({ task: t, now }: { task: PortalTask; now: number }) {
  const done = t.myStatus === "COMPLETED";
  const late = !done && t.myStatus !== "REVIEW" && t.dueAt && t.dueAt.getTime() < now;
  return (
    <li>
      <Link
        href={`/staff/tasks/${t.id}`}
        className={cn(
          "flex items-start gap-3 rounded-xl border border-a-border bg-a-surface p-3.5 transition-colors hover:border-a-strong",
          late && "border-l-4 border-l-a-danger",
          done && "bg-a-subtle/50",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[15px] font-semibold", done && "text-a-muted")}>{t.title}</span>
          {t.event && (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-a-muted">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" aria-hidden /> {t.event.title} · {fmtDate(t.event.eventDate)}
              </span>
              {t.event.venue && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden /> {t.event.venue}
                </span>
              )}
            </span>
          )}
          {t.workOrder && <span className="mt-0.5 block text-xs text-a-muted">Work order: {t.workOrder.title}</span>}
          {(t.dueAt || (done && t.myCompletedAt)) && (
            <span className={cn("mt-1 inline-flex items-center gap-1 text-xs", late ? "font-medium text-a-danger" : "text-a-muted")}>
              <Clock className="size-3.5" aria-hidden />
              {done && t.myCompletedAt ? `Finished ${fmtDateTime(t.myCompletedAt)}` : `${late ? "Overdue — was due" : "Due"} ${fmtDateTime(t.dueAt)}`}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge map={TASK_STATUS} value={t.myStatus} />
          {t.priority !== "MEDIUM" && <StatusBadge map={PRIORITY} value={t.priority} />}
          <ChevronRight className="size-4 text-a-muted" aria-hidden />
        </span>
      </Link>
    </li>
  );
}
