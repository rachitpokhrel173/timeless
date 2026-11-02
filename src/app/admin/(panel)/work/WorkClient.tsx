"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { ActionForm, Button, ConfirmButton, DialogButton, inputClass, SelectField, TextArea, TextField, useRun, type Option } from "@/components/admin/interactive";
import UploadButton from "@/components/admin/Upload";
import { Avatar } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { taskOptions, type TaskStatus } from "@/lib/task-status";
import type { PickerStaff } from "@/server/assignments";
import { setTaskStatus } from "../tasks/actions";
import { removeTaskReference, uploadTaskReference } from "../upload-actions";
import { deleteWorkTask, duplicateWorkTask, saveTaskInternalNotes, saveWorkTask, setTaskAssignees } from "./actions";

const PRIORITIES: Option[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];
const STATUSES: Option[] = taskOptions();

/** Date → value for <input type="datetime-local"> in Nepal time. */
const localInput = (d: Date | string | null | undefined) => (d ? new Date(new Date(d).getTime() + 345 * 60_000).toISOString().slice(0, 16) : "");

/* ───────── Staff picker ───────── */

/** Checkbox list of the team (submitted as staffIds[]), with workload and availability on the event day. */
export function StaffPicker({ staff, selected = [] }: { staff: PickerStaff[]; selected?: string[] }) {
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<string[]>(selected);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term ? staff.filter((s) => `${s.name} ${s.role ?? ""}`.toLowerCase().includes(term)) : staff;
    // People already on the event team first, then the least busy
    return [...list].sort((a, b) => Number(b.onEvent) - Number(a.onEvent) || a.open - b.open || a.name.localeCompare(b.name));
  }, [q, staff]);

  if (!staff.length) return <p className="rounded-md bg-a-subtle px-3 py-2 text-[13px] text-a-muted">No active team members yet. Add them under Staff first.</p>;

  return (
    <fieldset className="space-y-2">
      <legend className="flex w-full items-center justify-between text-[13px] font-medium">
        Assign to
        <span className="font-normal text-a-muted">{chosen.length ? `${chosen.length} selected` : "Nobody yet"}</span>
      </legend>
      <input type="hidden" name="staffIds[]" data-array value="" disabled />
      {staff.length > 6 && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the team…" aria-label="Search the team" className={inputClass} />}
      <ul className="max-h-72 divide-y divide-a-border overflow-y-auto rounded-lg border border-a-border">
        {shown.map((s) => {
          const on = chosen.includes(s.id);
          return (
            <li key={s.id}>
              <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-a-hover", on && "bg-a-accent-soft/50")}>
                <input
                  type="checkbox"
                  name="staffIds[]"
                  value={s.id}
                  checked={on}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))}
                  className="size-4 shrink-0 accent-[var(--a-accent)]"
                />
                {s.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small public avatar
                  <img src={s.photo} alt="" className="size-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <Avatar name={s.name} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium">
                    {s.name}
                    {s.onEvent && <span className="rounded bg-a-gold-soft px-1.5 text-[11px] font-medium text-a-gold">On this event</span>}
                  </span>
                  <span className="block truncate text-xs text-a-muted">
                    {[s.role, s.phone].filter(Boolean).join(" · ") || "Team"}
                    {!s.hasLogin && " · no login (won't see it)"}
                  </span>
                  {s.away && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-a-warning">
                      <AlertTriangle className="size-3" aria-hidden /> {s.away}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums">
                  <span className="block font-medium">{s.open} open</span>
                  {s.overdue > 0 && <span className="block text-a-danger">{s.overdue} overdue</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/* ───────── Task form ───────── */

export type TaskValues = {
  id: string;
  title: string;
  description: string | null;
  staffInstructions: string | null;
  internalNotes: string | null;
  startDate: string | null;
  dueAt: Date | string | null;
  priority: string;
  staffIds: string[];
};

export function TaskFormButton({ bookingId, staff, values, eventDate, label, variant = "secondary" }: { bookingId: string; staff: PickerStaff[]; values?: TaskValues; eventDate?: string; label?: string; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <DialogButton
      label={label ?? (values ? "Edit" : "Add task")}
      icon={values ? Pencil : Plus}
      variant={variant}
      size={values ? "sm" : "md"}
      title={values ? "Edit task" : "New task"}
      description={values ? values.title : "A piece of the decoration work, handed to one or more people."}
      dialogSize="lg"
    >
      {(close) => (
        <ActionForm action={saveWorkTask} extra={{ id: values?.id, bookingId }} success={values ? "Task saved" : "Task added — the team has been told"} onSuccess={close} onCancel={close}>
          <TextField label="Task" name="title" required maxLength={200} defaultValue={values?.title} placeholder="Stage decoration, entrance arch, lighting…" />
          <TextArea label="What needs doing" name="description" rows={4} maxLength={4000} defaultValue={values?.description ?? ""} placeholder="Designs, items and quantities from the approved quotation, colours, measurements…" />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Start" name="startDate" type="date" defaultValue={values?.startDate ?? ""} max={eventDate} />
            <TextField label="Deadline" name="dueAt" type="datetime-local" defaultValue={localInput(values?.dueAt)} />
            <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue={values?.priority ?? "MEDIUM"} />
          </div>
          <TextArea label="Instructions for the team" name="staffInstructions" rows={3} maxLength={2000} defaultValue={values?.staffInstructions ?? ""} hint="Shown to the people assigned." placeholder="Venue access from 6 am, handle the chandelier with care…" />
          <TextArea label="Internal notes" name="internalNotes" rows={2} maxLength={2000} defaultValue={values?.internalNotes ?? ""} hint="Planners only — never shown to the team." />
          <StaffPicker staff={staff} selected={values?.staffIds} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

/* ───────── Board actions ───────── */

export function AssignButton({ taskId, title, staff, selected }: { taskId: string; title: string; staff: PickerStaff[]; selected: string[] }) {
  return (
    <DialogButton label={selected.length ? "Reassign" : "Assign"} icon={UserPlus} size="sm" variant={selected.length ? "ghost" : "primary"} title="Who's doing this?" description={title} dialogSize="lg">
      {(close) => (
        <ActionForm
          action={setTaskAssignees}
          extra={{ taskId }}
          submitLabel="Save team"
          success={(d: { added: number; removed: number }) => (d.added ? `${d.added} assigned and told` : d.removed ? "Removed from the task" : "No changes")}
          onSuccess={close}
          onCancel={close}
        >
          <StaffPicker staff={staff} selected={selected} />
          <p className="text-xs text-a-muted">People you untick keep their history on the task. New people get a notification and an email.</p>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function DuplicateTaskButton({ id }: { id: string }) {
  const { run, pending } = useRun();
  return (
    <Button size="icon-sm" variant="ghost" icon={Copy} pending={pending} onClick={() => run(() => duplicateWorkTask({ id }), { success: "Task duplicated" })} title="Duplicate">
      <span className="sr-only">Duplicate task</span>
    </Button>
  );
}

export function DeleteWorkTaskButton({ id, title }: { id: string; title: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title={`Delete “${title}”?`} body="Its assignments, history and photos links are removed with it. The booking and quotation aren't affected." confirmLabel="Delete task" success="Task deleted" action={() => deleteWorkTask({ id })}>
      <span className="sr-only">Delete task</span>
    </ConfirmButton>
  );
}

/** A planner sets the whole task's status (applies to everyone on it). */
export function PlannerStatusSelect({ id, status }: { id: string; status: string }) {
  const { run, pending } = useRun();
  const [hold, setHold] = useState<"BLOCKED" | "WAITING_MATERIALS" | null>(null);
  return (
    <>
      <select
        aria-label="Task status"
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as TaskStatus;
          if (next === "BLOCKED" || next === "WAITING_MATERIALS") return setHold(next);
          run(() => setTaskStatus({ id, status: next, asPlanner: true }), { success: next === "CANCELLED" ? "Task cancelled" : "Status updated for everyone on the task" });
        }}
        className={`${inputClass} h-8 w-auto text-[13px]`}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {hold && (
        <DialogInline onClose={() => setHold(null)} title={hold === "BLOCKED" ? "Put the task on hold" : "Waiting for materials"}>
          <ActionForm
            action={setTaskStatus}
            extra={{ id, status: hold, asPlanner: true }}
            submitLabel={hold === "BLOCKED" ? "Put on hold" : "Save"}
            success={hold === "BLOCKED" ? "On hold" : "Marked as waiting for materials"}
            onSuccess={() => setHold(null)}
            onCancel={() => setHold(null)}
          >
            {hold === "BLOCKED" ? <TextArea label="Why?" name="reason" required rows={2} maxLength={500} /> : <TextArea label="What's missing? (optional)" name="reason" rows={2} maxLength={500} />}
          </ActionForm>
        </DialogInline>
      )}
    </>
  );
}

function DialogInline({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-a-border bg-a-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-a-muted hover:bg-a-hover">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function InternalNotesButton({ taskId, notes }: { taskId: string; notes: string }) {
  return (
    <DialogButton label={notes ? "Internal notes" : "Add internal note"} icon={Pencil} size="sm" variant="ghost" title="Internal notes" description="Planners only — never shown to the team.">
      {(close) => (
        <ActionForm action={saveTaskInternalNotes} extra={{ taskId }} success="Saved" onSuccess={close} onCancel={close}>
          <TextArea label="Notes" name="notes" rows={4} maxLength={2000} defaultValue={notes} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ReferenceUpload({ taskId }: { taskId: string }) {
  return (
    <UploadButton action={uploadTaskReference} fields={{ taskId }} label="Add reference images" accept="image/png,image/jpeg,image/webp" size="sm" variant="ghost" success="Reference images added" />
  );
}

export function RemoveReferenceButton({ taskId, mediaId }: { taskId: string; mediaId: string }) {
  const { run, pending } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => removeTaskReference(taskId, mediaId), { success: "Image removed" })}
      className="absolute -top-1.5 -right-1.5 rounded-full border border-a-border bg-a-surface p-0.5 text-a-muted shadow hover:text-a-danger"
      aria-label="Remove reference image"
    >
      <X className="size-3" />
    </button>
  );
}
