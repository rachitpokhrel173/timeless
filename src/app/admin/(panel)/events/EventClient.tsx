"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, PackageCheck, Pencil, Plus, Send, Trash2, Undo2, UserPlus } from "lucide-react";
import { TEAM_ROLES } from "@/lib/defaults";
import { ActionButton, ActionForm, Button, CheckboxField, ConfirmButton, DialogButton, inputClass, SelectField, TextArea, TextField, useRun, useToast, type Option } from "@/components/admin/interactive";
import { deleteDocument } from "../upload-actions";
import { addChecklist, addWorkPlan, deleteTask, saveTask, setTaskStatus } from "../tasks/actions";
import {
  addEventNote,
  assignStaff,
  deleteTimelineItem,
  removeStaff,
  reserveItems,
  returnItems,
  saveDesign,
  saveTimelineItem,
  saveVendorAssignment,
  setDesignStatus,
  setTimelineStatus,
  updateEvent,
} from "./actions";

const PRIORITIES: Option[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];
const TASK_STATUSES: Option[] = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED", label: "Completed" },
];
/** Date → value for <input type="datetime-local"> in Nepal time. */
export const localInput = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const t = new Date(new Date(d).getTime() + 345 * 60_000);
  return t.toISOString().slice(0, 16);
};

/* ───────── Event details ───────── */

export type EventValues = {
  id: string;
  title: string;
  eventType: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  venueAddress: string | null;
  guestCount: number | null;
  colorTheme: string | null;
  requirements: string | null;
  estimatedCost: number;
  status: string;
};

export function EditEventButton({ values, eventTypes }: { values: EventValues; eventTypes: Option[] }) {
  return (
    <DialogButton label="Edit details" icon={Pencil} title="Event details" dialogSize="lg">
      {(close) => (
        <ActionForm action={updateEvent} extra={{ id: values.id }} success="Event updated" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Title" name="title" defaultValue={values.title} required wrapClassName="sm:col-span-2" />
            <SelectField label="Event type" name="eventType" options={eventTypes} placeholder="Not set" defaultValue={values.eventType ?? ""} />
            <TextField label="Event date" name="eventDate" type="date" defaultValue={values.eventDate} required hint="Changing the date re-checks reserved inventory." />
            <TextField label="Guest arrival / start" name="startTime" type="time" defaultValue={values.startTime?.slice(0, 5) ?? ""} />
            <TextField label="End" name="endTime" type="time" defaultValue={values.endTime?.slice(0, 5) ?? ""} />
            <TextField label="Décor setup starts" name="setupStart" type="time" hint="Defaults to 07:00 — used for team and stock conflicts." />
            <TextField label="Guests" name="guestCount" type="number" min={0} defaultValue={values.guestCount ?? ""} />
            <TextField label="Venue" name="venue" defaultValue={values.venue ?? ""} />
            <TextField label="Venue address" name="venueAddress" defaultValue={values.venueAddress ?? ""} />
            <TextField label="Colour theme" name="colorTheme" defaultValue={values.colorTheme ?? ""} placeholder="Ivory, blush and gold" />
            <TextField label="Estimated cost (NPR)" name="estimatedCost" type="number" min={0} defaultValue={values.estimatedCost} hint="Compared with actual cost on the profit tab." />
            {["PLANNING", "READY"].includes(values.status) && (
              <SelectField
                label="Planning status"
                name="status"
                defaultValue={values.status}
                options={[
                  { value: "PLANNING", label: "Planning" },
                  { value: "READY", label: "Ready — all prepared" },
                ]}
              />
            )}
            <TextArea label="Requirements" name="requirements" rows={4} defaultValue={values.requirements ?? ""} wrapClassName="sm:col-span-2" />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

/* ───────── Tasks ───────── */

export type TaskValues = {
  id?: string;
  title?: string;
  description?: string | null;
  assigneeStaffId?: string | null;
  assigneeUserId?: string | null;
  dueAt?: Date | string | null;
  priority?: string;
  status?: string;
  checklist?: string | null;
  teamRole?: string | null;
};

export function TaskButton({ eventId, values, staff, users, events, compact }: { eventId?: string | null; values?: TaskValues; staff: Option[]; users: Option[]; events?: Option[]; compact?: boolean }) {
  const editing = !!values?.id;
  return (
    <DialogButton
      label={editing ? <span className="sr-only">Edit task</span> : "Add task"}
      icon={editing ? Pencil : Plus}
      size={editing || compact ? "icon-sm" : "sm"}
      variant={editing ? "ghost" : "secondary"}
      title={editing ? "Edit task" : "New task"}
    >
      {(close) => (
        <ActionForm action={saveTask} extra={{ id: values?.id ?? null, ...(events ? {} : { eventId: eventId ?? null }) }} success="Task saved" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Task" name="title" defaultValue={values?.title} required wrapClassName="sm:col-span-2" autoFocus />
            {events && <SelectField label="Event" name="eventId" options={events} placeholder="General (no event)" defaultValue={eventId ?? ""} wrapClassName="sm:col-span-2" />}
            <SelectField label="Team member" name="assigneeStaffId" options={staff} placeholder="Unassigned" defaultValue={values?.assigneeStaffId ?? ""} />
            <SelectField label="Admin user" name="assigneeUserId" options={users} placeholder="—" defaultValue={values?.assigneeUserId ?? ""} hint="Gets a notification." />
            <TextField label="Due" name="dueAt" type="datetime-local" defaultValue={localInput(values?.dueAt)} />
            <TextField label="Team role" name="teamRole" defaultValue={values?.teamRole ?? ""} list="team-roles" placeholder="Decorator, Crew…" hint="Given to whoever joins the team in this role." />
            <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue={values?.priority ?? "MEDIUM"} />
            <SelectField label="Status" name="status" options={TASK_STATUSES} defaultValue={values?.status ?? "TODO"} />
            <SelectField
              label="Checklist"
              name="checklist"
              options={[
                { value: "PRE", label: "Pre-event checklist" },
                { value: "POST", label: "Post-event checklist" },
              ]}
              placeholder="Regular task"
              defaultValue={values?.checklist ?? ""}
            />
            <TextArea label="Details" name="description" rows={3} defaultValue={values?.description ?? ""} wrapClassName="sm:col-span-2" />
          </div>
          <datalist id="team-roles">
            {TEAM_ROLES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function TaskStatusSelect({ id, status }: { id: string; status: string }) {
  const { run, pending } = useRun();
  return (
    <select
      aria-label="Task status"
      value={status}
      disabled={pending}
      onChange={(e) => run(() => setTaskStatus({ id, status: e.target.value as "TODO" }), { success: "Task updated" })}
      className={`${inputClass} h-8 w-auto text-[13px]`}
    >
      {TASK_STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function TaskCheck({ id, done, title }: { id: string; done: boolean; title: string }) {
  const { run, pending } = useRun();
  return (
    <input
      type="checkbox"
      aria-label={`${done ? "Reopen" : "Complete"} “${title}”`}
      checked={done}
      disabled={pending}
      onChange={() => run(() => setTaskStatus({ id, status: done ? "TODO" : "COMPLETED" }))}
      className="size-4 shrink-0 accent-[var(--a-accent)]"
    />
  );
}

export function DeleteTaskButton({ id }: { id: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title="Delete this task?" confirmLabel="Delete" success="Task deleted" action={() => deleteTask({ id })}>
      <span className="sr-only">Delete task</span>
    </ConfirmButton>
  );
}

export function WorkPlanButton({ eventId, plans }: { eventId: string; plans: Option[] }) {
  if (!plans.length) return null;
  return (
    <DialogButton label="Add work plan" icon={ClipboardList} size="sm" title="Add a work plan" description="Dated tasks for the team — set up in Settings → Work plans. Steps already on the event are skipped.">
      {(close) => (
        <ActionForm
          action={addWorkPlan}
          extra={{ eventId }}
          submitLabel="Add tasks"
          success={(d) => {
            const r = d as { added: number; assigned: number };
            return `${r.added} tasks added, ${r.assigned} assigned`;
          }}
          onSuccess={close}
          onCancel={close}
        >
          <SelectField label="Work plan" name="planId" options={plans} required />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ChecklistButton({ eventId, templates }: { eventId: string; templates: Option[] }) {
  if (!templates.length) return null;
  return (
    <DialogButton label="Add checklist" icon={CheckCircle2} size="sm" title="Add a checklist">
      {(close) => (
        <ActionForm action={addChecklist} extra={{ eventId }} submitLabel="Add items" success={(d) => `${(d as { added: number }).added} items added`} onSuccess={close} onCancel={close}>
          <SelectField label="Checklist" name="templateId" options={templates} required />
        </ActionForm>
      )}
    </DialogButton>
  );
}

/* ───────── Team ───────── */

export function AssignStaffButton({ eventId, staff }: { eventId: string; staff: Option[] }) {
  const toast = useToast();
  return (
    <DialogButton label="Assign team" icon={UserPlus} size="sm" title="Assign a team member">
      {(close) => (
        <ActionForm
          action={assignStaff}
          extra={{ eventId }}
          submitLabel="Assign"
          success={false}
          onCancel={close}
          onSuccess={(d) => {
            close();
            const c = (d as { conflicts: string[] }).conflicts;
            toast(c.length ? "error" : "success", c.length ? `Assigned — but they're also on ${c.join(", ")} at the same time.` : "Assigned");
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Team member" name="staffId" options={staff} required wrapClassName="sm:col-span-2" />
            <TextField label="Role at this event" name="role" placeholder="Lead decorator, lighting…" list="event-team-roles" hint="Work-plan tasks for this role go to them. Blank = their usual role." />
            <datalist id="event-team-roles">
              {TEAM_ROLES.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <TextField label="Days" name="days" type="number" min={0.5} step={0.5} defaultValue={1} hint="Used for staff cost." />
            <TextArea label="Notes" name="notes" rows={2} wrapClassName="sm:col-span-2" />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function RemoveStaffButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title={`Remove ${name}?`} confirmLabel="Remove" success="Removed" action={() => removeStaff({ id })}>
      <span className="sr-only">Remove {name}</span>
    </ConfirmButton>
  );
}

/* ───────── Vendors ───────── */

type VendorValues = { id?: string; vendorId?: string; service?: string; cost?: number; dueDate?: string | null; status?: string; notes?: string | null };

export function VendorAssignmentButton({ eventId, vendors, values }: { eventId: string; vendors: Option[]; values?: VendorValues }) {
  const editing = !!values?.id;
  return (
    <DialogButton label={editing ? <span className="sr-only">Edit vendor booking</span> : "Book vendor"} icon={editing ? Pencil : Plus} size={editing ? "icon-sm" : "sm"} variant={editing ? "ghost" : "secondary"} title={editing ? "Vendor booking" : "Book a vendor"}>
      {(close) => (
        <ActionForm action={saveVendorAssignment} extra={{ eventId, id: values?.id ?? null }} success="Saved" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Vendor" name="vendorId" options={vendors} required defaultValue={values?.vendorId ?? ""} placeholder="Choose a vendor" />
            <TextField label="Service" name="service" required defaultValue={values?.service} placeholder="Fresh roses, DJ, transport…" />
            <TextField label="Cost (NPR)" name="cost" type="number" min={0} defaultValue={values?.cost ?? 0} />
            <TextField label="Payment due" name="dueDate" type="date" defaultValue={values?.dueDate ?? ""} />
            <SelectField
              label="Status"
              name="status"
              defaultValue={values?.status ?? "REQUESTED"}
              options={[
                { value: "REQUESTED", label: "Requested" },
                { value: "CONFIRMED", label: "Confirmed" },
                { value: "COMPLETED", label: "Completed" },
                { value: "CANCELLED", label: "Cancelled" },
              ]}
            />
            <TextArea label="Notes" name="notes" rows={2} defaultValue={values?.notes ?? ""} wrapClassName="sm:col-span-2" />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

/* ───────── Inventory ───────── */

export type StockLine = { id: string; name: string; sku: string; unit: string; available: number; reserved: number; category: string | null };

export function ReserveButton({ eventId, items }: { eventId: string; items: StockLine[] }) {
  const [q, setQ] = useState("");
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(items.filter((i) => i.reserved).map((i) => [i.id, i.reserved])));
  const { run, pending } = useRun();
  const shown = useMemo(() => items.filter((i) => `${i.name} ${i.sku} ${i.category ?? ""}`.toLowerCase().includes(q.toLowerCase())), [items, q]);
  const changed = items.filter((i) => (qty[i.id] ?? 0) !== i.reserved);
  return (
    <DialogButton label="Reserve items" icon={PackageCheck} size="sm" variant="primary" title="Reserve inventory" description="Availability is for this event's date — stock held by overlapping events is excluded." dialogSize="lg">
      {(close) => (
        <div className="space-y-3">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" aria-label="Search items" className={inputClass} />
          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-a-border">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-a-subtle text-left text-xs text-a-muted uppercase">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Free</th>
                  <th className="w-28 px-3 py-2">Reserve</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const want = qty[i.id] ?? 0;
                  const over = want > i.available + i.reserved;
                  return (
                    <tr key={i.id} className="border-t border-a-border">
                      <td className="px-3 py-1.5">
                        {i.name}
                        <span className="block text-xs text-a-muted">
                          {i.sku}
                          {i.category ? ` · ${i.category}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {i.available + i.reserved} {i.unit}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          min={0}
                          aria-label={`Quantity of ${i.name}`}
                          aria-invalid={over || undefined}
                          value={want || ""}
                          onChange={(e) => setQty((all) => ({ ...all, [i.id]: Math.max(0, Math.round(Number(e.target.value))) }))}
                          className={`${inputClass} h-8`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <p className="p-4 text-center text-[13px] text-a-muted">No items match.</p>}
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-xs text-a-muted">{changed.length ? `${changed.length} change(s)` : "No changes"}</span>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="primary"
              pending={pending}
              disabled={!changed.length}
              onClick={() => run(() => reserveItems({ eventId, lines: changed.map((i) => ({ itemId: i.id, quantity: qty[i.id] ?? 0 })) }), { success: "Reservation updated", onSuccess: close })}
            >
              Save reservation
            </Button>
          </div>
        </div>
      )}
    </DialogButton>
  );
}

export function ReturnButton({ id, name, quantity, consumable }: { id: string; name: string; quantity: number; consumable: boolean }) {
  return (
    <DialogButton label="Record return" icon={Undo2} size="sm" title={`Return: ${name}`} description={`${quantity} sent to the event.`}>
      {(close) => (
        <ActionForm action={returnItems} extra={{ id }} submitLabel="Record return" success="Return recorded" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Damaged" name="damaged" type="number" min={0} max={quantity} defaultValue={0} />
            <TextField label="Lost" name="lost" type="number" min={0} max={quantity} defaultValue={0} />
            <TextField label={consumable ? "Used up" : "Used (consumed)"} name="used" type="number" min={0} max={quantity} defaultValue={consumable ? quantity : 0} />
            <TextArea label="Notes" name="notes" rows={2} wrapClassName="sm:col-span-3" />
          </div>
          <p className="text-xs text-a-muted">Everything not marked lost or used goes back on the shelf; damaged units are set aside for repair.</p>
        </ActionForm>
      )}
    </DialogButton>
  );
}

/* ───────── Run sheet ───────── */

export function TimelineButton({ eventId, staff, values, defaultDate }: { eventId: string; staff: Option[]; defaultDate: string; values?: { id: string; startsAt: Date; title: string; responsibleStaffId: string | null; notes: string | null } }) {
  const editing = !!values;
  return (
    <DialogButton label={editing ? <span className="sr-only">Edit item</span> : "Add item"} icon={editing ? Pencil : Plus} size={editing ? "icon-sm" : "sm"} variant={editing ? "ghost" : "secondary"} title={editing ? "Run-sheet item" : "Add to run sheet"}>
      {(close) => (
        <ActionForm action={saveTimelineItem} extra={{ eventId, id: values?.id ?? null }} success="Saved" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Time" name="startsAt" type="datetime-local" required defaultValue={values ? localInput(values.startsAt) : `${defaultDate}T08:00`} />
            <TextField label="What happens" name="title" required defaultValue={values?.title} placeholder="Stage setup begins" />
            <SelectField label="Responsible" name="responsibleStaffId" options={staff} placeholder="—" defaultValue={values?.responsibleStaffId ?? ""} wrapClassName="sm:col-span-2" />
            <TextArea label="Notes" name="notes" rows={2} defaultValue={values?.notes ?? ""} wrapClassName="sm:col-span-2" />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function TimelineDone({ id, done }: { id: string; done: boolean }) {
  const { run, pending } = useRun();
  return (
    <input
      type="checkbox"
      aria-label={done ? "Mark not done" : "Mark done"}
      checked={done}
      disabled={pending}
      onChange={() => run(() => setTimelineStatus({ id, status: done ? "TODO" : "COMPLETED" }))}
      className="size-4 accent-[var(--a-accent)]"
    />
  );
}

export function DeleteTimelineButton({ id }: { id: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title="Remove this item?" confirmLabel="Remove" action={() => deleteTimelineItem({ id })}>
      <span className="sr-only">Remove</span>
    </ConfirmButton>
  );
}

/* ───────── Notes, designs, documents ───────── */

export function EventNoteForm({ eventId }: { eventId: string }) {
  return (
    <ActionForm action={addEventNote} extra={{ eventId }} submitLabel="Add note" success="Note added" resetOnSuccess>
      <TextArea label="Note" name="body" rows={2} required />
      <CheckboxField name="visibility" label="Share with the client" hint="Shared notes appear in the client portal." value="CLIENT" />
    </ActionForm>
  );
}

export function DesignButton({ eventId, values }: { eventId: string; values?: { id: string; title: string; description: string | null } }) {
  return (
    <DialogButton label={values ? <span className="sr-only">Edit design</span> : "New design"} icon={values ? Pencil : Plus} size={values ? "icon-sm" : "sm"} variant={values ? "ghost" : "secondary"} title={values ? "Edit design" : "New design for approval"}>
      {(close) => (
        <ActionForm action={saveDesign} extra={{ eventId, id: values?.id ?? null }} success="Saved" onSuccess={close} onCancel={close}>
          <TextField label="Title" name="title" required defaultValue={values?.title} placeholder="Stage concept — v1" />
          <TextArea label="Description" name="description" rows={3} defaultValue={values?.description ?? ""} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function DesignStatusButtons({ id, status }: { id: string; status: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {["DRAFT", "REVISION_REQUESTED"].includes(status) && (
        <ActionButton size="sm" icon={Send} action={() => setDesignStatus({ id, status: "SENT" })} success="Marked as sent to the client">
          {status === "DRAFT" ? "Send to client" : "Send revision"}
        </ActionButton>
      )}
      {["SENT", "VIEWED"].includes(status) && (
        <>
          <DialogButton label="Approved" size="sm" icon={CheckCircle2} title="Client approved">
            {(close) => (
              <ActionForm action={setDesignStatus} extra={{ id, status: "APPROVED" }} submitLabel="Record approval" success="Approved" onSuccess={close} onCancel={close}>
                <TextArea label="Client's comments (optional)" name="response" rows={2} />
              </ActionForm>
            )}
          </DialogButton>
          <DialogButton label="Revision requested" size="sm" variant="danger-ghost" title="Client asked for changes">
            {(close) => (
              <ActionForm action={setDesignStatus} extra={{ id, status: "REVISION_REQUESTED" }} submitLabel="Save" success="Saved" onSuccess={close} onCancel={close}>
                <TextArea label="What should change?" name="response" rows={3} required />
              </ActionForm>
            )}
          </DialogButton>
        </>
      )}
    </div>
  );
}

export function DeleteDocumentButton({ id, title }: { id: string; title: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title={`Delete “${title}”?`} body="The file is removed from storage." confirmLabel="Delete" success="Deleted" action={() => deleteDocument(id)}>
      <span className="sr-only">Delete {title}</span>
    </ConfirmButton>
  );
}
