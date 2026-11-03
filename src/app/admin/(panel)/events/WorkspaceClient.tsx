"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, ListPlus, MessageSquare, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { ActionForm, Button, ConfirmButton, DialogButton, inputClass, SelectField, TextArea, TextField, useRun, type Option } from "@/components/admin/interactive";
import { TEAM_ROLES } from "@/lib/defaults";
import {
  addChecklistItem,
  addTaskComment,
  addTaskForWorkOrder,
  addWorkOrderNote,
  completeEvent,
  createWorkOrdersFromServices,
  deleteChecklistItem,
  deleteTaskComment,
  deleteWorkOrder,
  saveService,
  saveWorkOrder,
  setWorkOrderStatus,
  toggleChecklistItem,
} from "./workspace-actions";

const PRIORITIES: Option[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];
const WO_STATUSES: Option[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];
const SERVICE_STATUSES: Option[] = [
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "READY", label: "Ready" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];
const roleOptions: Option[] = TEAM_ROLES.map((r) => ({ value: r, label: r }));

/** Date → value for <input type="datetime-local"> in Nepal time. */
const localInput = (d: Date | string | null | undefined) => (d ? new Date(new Date(d).getTime() + 345 * 60_000).toISOString().slice(0, 16) : "");

/* ───────── Work orders ───────── */

export function CreateWorkOrdersButton({ eventId }: { eventId: string }) {
  const { run, pending } = useRun();
  return (
    <Button size="sm" icon={Wand2} pending={pending} onClick={() => run(() => createWorkOrdersFromServices({ eventId }), { success: (r) => `${r.created} work order${r.created === 1 ? "" : "s"} created` })}>
      Create from services
    </Button>
  );
}

export type WorkOrderValues = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  requiredMaterials: string | null;
  teamRole: string | null;
  assignedStaffId: string | null;
  bookingItemId: string | null;
  designId: string | null;
  startDate: string | null;
  dueAt: Date | string | null;
  priority: string;
};

export function WorkOrderButton({ eventId, values, services, designs, staff }: { eventId: string; values?: WorkOrderValues; services: Option[]; designs: Option[]; staff: Option[] }) {
  return (
    <DialogButton
      label={values ? <span className="sr-only">Edit work order</span> : "New work order"}
      icon={values ? Pencil : Plus}
      size={values ? "icon-sm" : "sm"}
      variant={values ? "ghost" : "secondary"}
      title={values ? "Edit work order" : "New work order"}
      dialogSize="lg"
    >
      {(close) => (
        <ActionForm action={saveWorkOrder} extra={{ id: values?.id ?? null, eventId }} success="Work order saved" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Title" name="title" required defaultValue={values?.title} placeholder="Stage backdrop" wrapClassName="sm:col-span-2" />
            <SelectField label="Service" name="bookingItemId" options={services} placeholder="Not tied to a service" defaultValue={values?.bookingItemId ?? ""} />
            <SelectField label="Approved design" name="designId" options={designs} placeholder="None" defaultValue={values?.designId ?? ""} />
            <SelectField label="Team" name="teamRole" options={roleOptions} placeholder="Any" defaultValue={values?.teamRole ?? ""} />
            <SelectField label="Lead" name="assignedStaffId" options={staff} placeholder="Not assigned" defaultValue={values?.assignedStaffId ?? ""} />
            <TextField label="Start date" name="startDate" type="date" defaultValue={values?.startDate ?? ""} />
            <TextField label="Due" name="dueAt" type="datetime-local" defaultValue={localInput(values?.dueAt)} />
            <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue={values?.priority ?? "MEDIUM"} />
            <TextArea label="Description" name="description" rows={3} defaultValue={values?.description ?? ""} wrapClassName="sm:col-span-2" />
            <TextArea label="Instructions for the team" name="instructions" rows={3} defaultValue={values?.instructions ?? ""} />
            <TextArea label="Materials needed" name="requiredMaterials" rows={3} defaultValue={values?.requiredMaterials ?? ""} />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function WorkOrderStatusSelect({ id, status }: { id: string; status: string }) {
  const { run, pending } = useRun();
  const [hold, setHold] = useState(false);
  return (
    <>
      <select
        aria-label="Work order status"
        value={status}
        disabled={pending}
        onChange={(e) => {
          if (e.target.value === "ON_HOLD") return setHold(true);
          run(() => setWorkOrderStatus({ id, status: e.target.value as "OPEN" }), { success: "Status updated" });
        }}
        className={`${inputClass} h-8 w-auto text-[13px]`}
      >
        {WO_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {hold && (
        <InlineDialog title="Put the work order on hold" onClose={() => setHold(false)}>
          <ActionForm action={setWorkOrderStatus} extra={{ id, status: "ON_HOLD" }} submitLabel="Put on hold" success="On hold" onSuccess={() => setHold(false)} onCancel={() => setHold(false)}>
            <TextArea label="Why?" name="note" required rows={2} maxLength={2000} />
          </ActionForm>
        </InlineDialog>
      )}
    </>
  );
}

export function WorkOrderNoteButton({ workOrderId }: { workOrderId: string }) {
  return (
    <DialogButton label={<span className="sr-only">Add note</span>} icon={MessageSquare} size="icon-sm" variant="ghost" title="Add a note to the work order">
      {(close) => (
        <ActionForm action={addWorkOrderNote} extra={{ workOrderId }} submitLabel="Add note" success="Note added" onSuccess={close} onCancel={close}>
          <TextArea label="Note" name="body" required rows={3} maxLength={2000} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function WorkOrderTaskButton({ workOrderId, staff }: { workOrderId: string; staff: Option[] }) {
  return (
    <DialogButton label={<span className="sr-only">Add task</span>} icon={ListPlus} size="icon-sm" variant="ghost" title="Add a task to this work order">
      {(close) => (
        <ActionForm action={addTaskForWorkOrder} extra={{ workOrderId }} submitLabel="Add task" success="Task added" onSuccess={close} onCancel={close}>
          <TextField label="Task" name="title" required />
          <SelectField label="Assign to" name="assigneeStaffId" options={staff} placeholder="Not assigned" />
          <TextField label="Due" name="dueAt" type="datetime-local" />
          <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue="MEDIUM" />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function DeleteWorkOrderButton({ id, title }: { id: string; title: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title={`Delete “${title}”?`} body="Only work orders without tasks can be deleted. Cancel it instead to keep the record." confirmLabel="Delete" success="Deleted" action={() => deleteWorkOrder({ id })}>
      <span className="sr-only">Delete work order</span>
    </ConfirmButton>
  );
}

/* ───────── Services ───────── */

export function ServiceButton({ id, description, status, specifications }: { id: string; description: string; status: string; specifications: string | null }) {
  return (
    <DialogButton label={<span className="sr-only">Update service</span>} icon={Pencil} size="icon-sm" variant="ghost" title={description}>
      {(close) => (
        <ActionForm action={saveService} extra={{ id }} success="Service updated" onSuccess={close} onCancel={close}>
          <SelectField label="Status" name="status" options={SERVICE_STATUSES} defaultValue={status} />
          <TextArea label="Specifications" name="specifications" rows={4} defaultValue={specifications ?? ""} hint="Sizes, colours, materials — what the team needs to build it. Price and quantity stay as booked." />
        </ActionForm>
      )}
    </DialogButton>
  );
}

/* ───────── Completion ───────── */

export function CompleteEventButton({ eventId, blockers, balance }: { eventId: string; blockers: string[]; balance: number }) {
  return (
    <DialogButton label="Complete event" icon={CheckCircle2} variant="primary" size="sm" title="Complete & close the event">
      {(close) => (
        <ActionForm
          action={completeEvent}
          extra={{ eventId }}
          submitLabel="Complete event"
          success={(r: { balance: number }) => (r.balance > 0 ? "Event completed — the balance is still due on the booking" : "Event completed")}
          onSuccess={close}
          onCancel={close}
        >
          {blockers.length > 0 ? (
            <div className="rounded-md bg-a-danger-soft px-3 py-2 text-[13px] text-a-danger">
              <p className="font-medium">Finish these first:</p>
              <ul className="mt-1 list-disc pl-5">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[13px] text-a-muted">Every work order, task and inventory line is closed. Completing marks the event and its booking as completed.</p>
          )}
          {balance > 0 && <p className="text-[13px] text-a-warning">A balance is still due on the booking. Payments aren&rsquo;t changed by completing the event.</p>}
          <TextArea label="Completion notes" name="notes" rows={3} placeholder="How it went, client feedback, anything to remember next time" />
        </ActionForm>
      )}
    </DialogButton>
  );
}

/* ───────── Task checklist & comments ───────── */

export type ChecklistItem = { id: string; label: string; doneAt: Date | string | null; doneBy: string | null };

export function TaskChecklist({ taskId, items, canEdit, canTick }: { taskId: string; items: ChecklistItem[]; canEdit: boolean; canTick: boolean }) {
  const { run, pending } = useRun();
  const [label, setLabel] = useState("");
  function add(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    run(() => addChecklistItem({ taskId, label }), { onSuccess: () => setLabel("") });
  }
  const done = items.filter((i) => i.doneAt).length;
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <p className="text-xs text-a-muted">
          {done} of {items.length} done
        </p>
      )}
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!i.doneAt}
              disabled={!canTick || pending}
              aria-label={i.label}
              onChange={() => run(() => toggleChecklistItem({ id: i.id, done: !i.doneAt }))}
              className="size-4 shrink-0 accent-[var(--a-accent)]"
            />
            <span className={`flex-1 ${i.doneAt ? "text-a-muted line-through" : ""}`}>{i.label}</span>
            {canEdit && (
              <button type="button" aria-label={`Remove ${i.label}`} className="rounded p-1 text-a-muted hover:bg-a-hover" onClick={() => run(() => deleteChecklistItem({ id: i.id }))}>
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form onSubmit={add} className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={300} placeholder="Add a checklist item" aria-label="New checklist item" className={`${inputClass} h-8 flex-1 text-[13px]`} />
          <Button size="sm" type="submit" icon={Plus} pending={pending}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}

export type TaskCommentView = { id: string; body: string; author: string; mine: boolean; createdAt: string };

export function TaskComments({ taskId, comments, canComment }: { taskId: string; comments: TaskCommentView[]; canComment: boolean }) {
  const { run, pending } = useRun();
  const [body, setBody] = useState("");
  function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    run(() => addTaskComment({ taskId, body }), { onSuccess: () => setBody("") });
  }
  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-[13px] text-a-muted">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border border-a-border p-2.5">
              <p className="whitespace-pre-line text-[13px]">{c.body}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-a-muted">
                {c.author} · {c.createdAt}
                {c.mine && (
                  <button type="button" className="ml-auto hover:underline" onClick={() => run(() => deleteTaskComment({ id: c.id }), { success: "Comment removed" })}>
                    Remove
                  </button>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <form onSubmit={add} className="space-y-2">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={2000} placeholder="Write a comment for the team" aria-label="Comment" className={`${inputClass} h-auto py-2`} />
          <div className="flex justify-end">
            <Button size="sm" type="submit" icon={MessageSquare} pending={pending}>
              Comment
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function InlineDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-a-border bg-a-surface p-5 shadow-2xl">
        <h2 className="mb-3 text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
