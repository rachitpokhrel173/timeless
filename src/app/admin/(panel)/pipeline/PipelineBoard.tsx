"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlarmClock, CalendarDays, GripVertical } from "lucide-react";
import { Button, Dialog, inputClass, useRun } from "@/components/admin/interactive";
import { Badge } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { moveLeadAction } from "../leads/actions";

export type BoardLead = {
  id: string;
  number: string;
  name: string;
  eventType: string;
  eventDate: string | null;
  budget: string | null;
  source: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assignee: string | null;
  nextFollowUp: string | null;
  followUpOverdue: boolean;
};
type Status = "NEW" | "CONTACTED" | "QUALIFIED" | "QUOTED" | "NEGOTIATION" | "CONFIRMED" | "COMPLETED" | "LOST";
export type BoardColumn = { status: Status; label: string; total: number; leads: BoardLead[] };

const PRIORITY_TONE = { LOW: "neutral", MEDIUM: "info", HIGH: "warning", URGENT: "danger" } as const;
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function Card({ lead, columns, onMove, dragging }: { lead: BoardLead; columns: BoardColumn[]; onMove?: (status: Status) => void; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-lg border border-a-border bg-a-surface p-3 shadow-[0_1px_0_rgba(0,0,0,0.03)]", isDragging && "opacity-40", dragging && "rotate-1 shadow-lg")}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          className="-ml-1 cursor-grab touch-none rounded p-0.5 text-a-muted hover:bg-a-hover active:cursor-grabbing"
          aria-label={`Drag ${lead.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <Link href={`/admin/leads/${lead.id}`} className="block truncate text-[13px] font-semibold hover:underline">
            {lead.name}
          </Link>
          <p className="truncate text-xs text-a-muted">
            {lead.eventType}
            {lead.budget && ` · ${lead.budget}`}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-a-muted">
        {lead.eventDate && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3" aria-hidden />
            {dateFmt.format(new Date(lead.eventDate))}
          </span>
        )}
        {lead.nextFollowUp && (
          <span className={cn("inline-flex items-center gap-1", lead.followUpOverdue && "font-semibold text-a-danger")}>
            <AlarmClock className="size-3" aria-hidden />
            {lead.followUpOverdue ? "Overdue" : dateFmt.format(new Date(lead.nextFollowUp))}
          </span>
        )}
        <Badge tone={PRIORITY_TONE[lead.priority]} icon={false} className="ml-auto">
          {lead.priority.toLowerCase()}
        </Badge>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-a-border pt-2">
        <span className="truncate text-[11px] text-a-muted">
          {lead.source}
          {lead.assignee && ` · ${lead.assignee}`}
        </span>
        {onMove && (
          <select
            aria-label={`Move ${lead.name} to stage`}
            value=""
            onChange={(e) => e.target.value && onMove(e.target.value as Status)}
            className="max-w-24 rounded border border-a-border bg-a-surface px-1 py-0.5 text-[11px] text-a-muted"
          >
            <option value="">Move to…</option>
            {columns.map((c) => (
              <option key={c.status} value={c.status}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </li>
  );
}

function Column({ column, columns, onMove }: { column: BoardColumn; columns: BoardColumn[]; onMove: (id: string, status: Status) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.status}` });
  const hidden = column.total - column.leads.length;
  return (
    <section className="flex w-[272px] shrink-0 flex-col rounded-xl bg-a-subtle/70" aria-label={`${column.label} column`}>
      <header className="flex items-center justify-between px-3 pt-3 pb-2">
        <h2 className="text-xs font-semibold tracking-wide text-a-muted uppercase">{column.label}</h2>
        <span className="rounded-full bg-a-surface px-2 text-[11px] font-semibold text-a-muted">{column.total}</span>
      </header>
      <SortableContext items={column.leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={cn("flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2", isOver && "rounded-lg bg-a-accent-soft/60")}>
          {column.leads.map((lead) => (
            <Card key={lead.id} lead={lead} columns={columns.filter((c) => c.status !== column.status)} onMove={(s) => onMove(lead.id, s)} />
          ))}
          {column.leads.length === 0 && <li className="rounded-lg border border-dashed border-a-border px-3 py-6 text-center text-xs text-a-muted">Drop leads here</li>}
        </ul>
      </SortableContext>
      {hidden > 0 && (
        <Link href={`/admin/leads?stage=${column.status}`} className="px-3 pb-3 text-xs text-a-muted hover:text-a-text">
          + {hidden} more in the leads list
        </Link>
      )}
    </section>
  );
}

export default function PipelineBoard({ initial }: { initial: BoardColumn[] }) {
  const [columns, setColumns] = useState(initial);
  const [active, setActive] = useState<BoardLead | null>(null);
  const [lost, setLost] = useState<{ id: string; beforeId: string | null; snapshot: BoardColumn[] } | null>(null);
  const [reason, setReason] = useState("");
  const { run, pending } = useRun();
  // New server data (after a refresh) replaces the local board
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setColumns(initial);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const findColumn = (id: string) => columns.find((c) => `col:${c.status}` === id || c.leads.some((l) => l.id === id));
  const byId = useMemo(() => new Map(columns.flatMap((c) => c.leads.map((l) => [l.id, l] as const))), [columns]);

  const commit = (id: string, status: Status, beforeId: string | null, snapshot: BoardColumn[], lostReason?: string) =>
    run(() => moveLeadAction({ id, stage: status, beforeId, lostReason }), {
      refresh: true,
      onError: () => setColumns(snapshot),
    });

  const onDragStart = (e: DragStartEvent) => setActive(byId.get(String(e.active.id)) ?? null);

  // Live preview while dragging between columns
  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(String(a.id));
    const to = findColumn(String(over.id));
    if (!from || !to || from.status === to.status) return;
    setColumns((cols) => {
      const lead = from.leads.find((l) => l.id === a.id)!;
      return cols.map((c) => {
        if (c.status === from.status) return { ...c, leads: c.leads.filter((l) => l.id !== a.id), total: c.total - 1 };
        if (c.status === to.status) {
          const idx = c.leads.findIndex((l) => l.id === over.id);
          const leads = [...c.leads];
          leads.splice(idx === -1 ? leads.length : idx, 0, lead);
          return { ...c, leads, total: c.total + 1 };
        }
        return c;
      });
    });
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    setActive(null);
    if (!over) return setColumns(initial);
    const col = findColumn(String(over.id)) ?? findColumn(String(a.id));
    if (!col) return;
    const ids = col.leads.map((l) => l.id);
    const from = ids.indexOf(String(a.id));
    const overIdx = ids.indexOf(String(over.id));
    if (from !== -1 && overIdx !== -1 && from !== overIdx) {
      const [moved] = ids.splice(from, 1);
      ids.splice(overIdx, 0, moved);
      setColumns((cols) => cols.map((c) => (c.status === col.status ? { ...c, leads: ids.map((id) => byId.get(id)!) } : c)));
    }
    const pos = ids.indexOf(String(a.id));
    const beforeId = ids[pos + 1] ?? null;
    const original = initial.find((c) => c.leads.some((l) => l.id === a.id));
    if (col.status === "LOST" && original?.status !== "LOST") {
      setLost({ id: String(a.id), beforeId, snapshot: initial });
      return;
    }
    void commit(String(a.id), col.status, beforeId, initial);
  };

  const moveByMenu = (id: string, status: Status) => {
    const snapshot = columns;
    const lead = byId.get(id)!;
    setColumns((cols) =>
      cols.map((c) =>
        c.leads.some((l) => l.id === id)
          ? { ...c, leads: c.leads.filter((l) => l.id !== id), total: c.total - 1 }
          : c.status === status
            ? { ...c, leads: [...c.leads, lead], total: c.total + 1 }
            : c,
      ),
    );
    if (status === "LOST") setLost({ id, beforeId: null, snapshot });
    else void commit(id, status, null, snapshot);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          setColumns(initial);
        }}
        accessibility={{
          announcements: {
            onDragStart: ({ active: a }) => `Picked up ${byId.get(String(a.id))?.name}.`,
            onDragOver: ({ over }) => (over ? `Over ${findColumn(String(over.id))?.label ?? "a column"}.` : "Not over a column."),
            onDragEnd: ({ over }) => (over ? `Moved to ${findColumn(String(over.id))?.label}.` : "Move cancelled."),
            onDragCancel: () => "Move cancelled.",
          },
        }}
      >
        <div className="-mx-3 overflow-x-auto px-3 pb-4 md:-mx-6 md:px-6">
          <div className="flex min-w-max gap-3">
            {columns.map((c) => (
              <Column key={c.status} column={c} columns={columns} onMove={moveByMenu} />
            ))}
          </div>
        </div>
        <DragOverlay>{active ? <ul><Card lead={active} columns={[]} dragging /></ul> : null}</DragOverlay>
      </DndContext>
      <Dialog
        open={!!lost}
        onClose={() => {
          if (lost) setColumns(lost.snapshot);
          setLost(null);
        }}
        title="Mark lead as lost"
        description="A short reason helps spot patterns later (price, date taken, chose another vendor…)."
        size="sm"
        footer={
          <>
            <Button
              onClick={() => {
                if (lost) setColumns(lost.snapshot);
                setLost(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              pending={pending}
              onClick={() => {
                if (!lost) return;
                void commit(lost.id, "LOST", lost.beforeId, lost.snapshot, reason || undefined).then(() => {
                  setLost(null);
                  setReason("");
                });
              }}
            >
              Mark as lost
            </Button>
          </>
        }
      >
        <label className="block text-[13px] font-medium">
          Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={cn(inputClass, "mt-1")} maxLength={300} />
        </label>
      </Dialog>
    </>
  );
}
