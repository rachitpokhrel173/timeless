import { CalendarCheck, FileText, Mail, MessageCircle, Phone, Repeat2, Sparkles, StickyNote, Users, type LucideIcon } from "lucide-react";
import { fmtDateTime, relativeTime } from "@/lib/format";
import { EmptyState } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  NOTE: StickyNote,
  CALL: Phone,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  MEETING: Users,
  STAGE_CHANGE: Repeat2,
  QUOTATION: FileText,
  BOOKING: CalendarCheck,
  SYSTEM: Sparkles,
};

export type TimelineEntry = { id: string; type: string; body: string; at: Date; actor?: string | null; context?: string | null };

/** Vertical activity history (lead activities, customer history, audit trail…). */
export default function ActivityTimeline({ entries, empty = "No activity yet." }: { entries: TimelineEntry[]; empty?: string }) {
  if (!entries.length) return <EmptyState compact title={empty} />;
  return (
    <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-a-border">
      {entries.map((e) => {
        const Icon = ICONS[e.type] ?? Sparkles;
        return (
          <li key={e.id} className="relative flex gap-3">
            <span className="relative z-10 flex size-[27px] shrink-0 items-center justify-center rounded-full border border-a-border bg-a-surface text-a-muted">
              <Icon className="size-3.5" aria-hidden />
              <span className="sr-only">{e.type.toLowerCase().replace("_", " ")}</span>
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[13px] whitespace-pre-wrap">{e.body}</p>
              <p className="mt-0.5 text-xs text-a-muted" title={fmtDateTime(e.at)}>
                {[e.actor, e.context, relativeTime(e.at)].filter(Boolean).join(" · ")}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
