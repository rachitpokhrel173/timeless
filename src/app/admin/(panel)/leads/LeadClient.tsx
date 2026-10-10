"use client";

import { useState } from "react";
import { CalendarPlus, CheckCircle2, MessageSquarePlus, Pencil } from "lucide-react";
import { ActionForm, Button, Dialog, DialogButton, SelectField, TextArea, TextField, inputClass, useRun, type Option } from "@/components/admin/interactive";
import { cn } from "@/lib/utils";
import { addFollowup, completeFollowupAction, logActivityAction, moveLeadAction, updateFollowup } from "./actions";
import LeadForm, { type LeadFormOptions, type LeadFormValues } from "./LeadForm";

export function EditLeadButton({ values, opts }: { values: LeadFormValues; opts: LeadFormOptions }) {
  return (
    <DialogButton label="Edit" icon={Pencil} title="Edit lead" dialogSize="lg">
      {(close) => <LeadForm values={values} opts={opts} onDone={close} />}
    </DialogButton>
  );
}

type Stage = "NEW" | "CONTACTED" | "QUALIFIED" | "QUOTED" | "NEGOTIATION" | "CONFIRMED" | "COMPLETED" | "LOST";

/** Clickable pipeline stepper for one lead. */
export function StageControl({ id, stage, stages, disabled }: { id: string; stage: string; stages: Option[]; disabled?: boolean }) {
  const { run, pending } = useRun();
  const [lostOpen, setLostOpen] = useState(false);
  const [reason, setReason] = useState("");
  const current = stages.findIndex((s) => s.value === stage);
  const move = (s: string, lostReason?: string) =>
    run(() => moveLeadAction({ id, stage: s as Stage, beforeId: null, lostReason }), { success: "Stage updated", onSuccess: () => setLostOpen(false) });
  return (
    <>
      <ol className="flex flex-wrap gap-1" aria-label="Pipeline stage">
        {stages.map((s, i) => {
          const done = stage !== "LOST" && i < current && s.value !== "LOST";
          const active = s.value === stage;
          return (
            <li key={s.value}>
              <button
                type="button"
                disabled={disabled || pending || active}
                aria-current={active ? "step" : undefined}
                onClick={() => (s.value === "LOST" ? setLostOpen(true) : move(s.value))}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 disabled:cursor-default",
                  active
                    ? s.value === "LOST"
                      ? "border-transparent bg-a-danger text-white"
                      : "border-transparent bg-a-accent text-a-on-accent"
                    : done
                      ? "border-a-accent/30 bg-a-accent-soft text-a-accent hover:bg-a-accent-soft/70"
                      : "border-a-border text-a-muted hover:bg-a-hover hover:text-a-text",
                )}
              >
                {done && <CheckCircle2 className="mr-1 inline size-3" aria-hidden />}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>
      <Dialog
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Mark lead as lost"
        size="sm"
        footer={
          <>
            <Button onClick={() => setLostOpen(false)}>Cancel</Button>
            <Button variant="danger" pending={pending} onClick={() => move("LOST", reason || undefined)}>
              Mark as lost
            </Button>
          </>
        }
      >
        <label className="block text-[13px] font-medium">
          Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={cn(inputClass, "mt-1")} maxLength={300} placeholder="e.g. chose another decorator, date taken, budget" />
        </label>
      </Dialog>
    </>
  );
}

const TYPES: Option[] = ["CALL", "WHATSAPP", "EMAIL", "MEETING", "OTHER"].map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }));
const PRIORITIES: Option[] = ["LOW", "MEDIUM", "HIGH", "URGENT"].map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }));

export type FollowupValues = { id?: string; date?: string; time?: string; type?: string; priority?: string; note?: string | null; assignedTo?: string | null };
type Owner = { leadId?: string; inquiryId?: string; customerId?: string };

export function FollowupForm({ owner, values = {}, users, onDone }: { owner: Owner; values?: FollowupValues; users: Option[]; onDone: () => void }) {
  return (
    <ActionForm
      action={values.id ? updateFollowup : addFollowup}
      extra={{ leadId: owner.leadId ?? null, inquiryId: owner.inquiryId ?? null, customerId: owner.customerId ?? null, ...(values.id && { id: values.id }) }}
      submitLabel={values.id ? "Save" : "Schedule"}
      success={values.id ? "Follow-up updated" : "Follow-up scheduled"}
      onSuccess={onDone}
      onCancel={onDone}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Date" name="date" type="date" defaultValue={values.date} required />
        <TextField label="Time" name="time" type="time" defaultValue={values.time ?? "10:00"} />
        <SelectField label="Type" name="type" options={TYPES} defaultValue={values.type ?? "CALL"} />
        <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue={values.priority ?? "MEDIUM"} />
        <SelectField label="Assigned to" name="assignedTo" options={users} placeholder="Me" defaultValue={values.assignedTo ?? ""} wrapClassName="sm:col-span-2" />
        <TextArea label="What to discuss" name="note" rows={2} defaultValue={values.note ?? ""} wrapClassName="sm:col-span-2" />
      </div>
    </ActionForm>
  );
}

export function AddFollowupButton({ owner, users, defaultDate, size = "sm" }: { owner: Owner; users: Option[]; defaultDate: string; size?: "sm" | "md" }) {
  return (
    <DialogButton label="Schedule" icon={CalendarPlus} size={size} title="Schedule a follow-up">
      {(close) => <FollowupForm owner={owner} users={users} values={{ date: defaultDate }} onDone={close} />}
    </DialogButton>
  );
}

export function EditFollowupButton({ owner, users, values }: { owner: Owner; users: Option[]; values: FollowupValues }) {
  return (
    <DialogButton label={<span className="sr-only">Reschedule</span>} icon={Pencil} size="icon-sm" variant="ghost" title="Reschedule follow-up">
      {(close) => <FollowupForm owner={owner} users={users} values={values} onDone={close} />}
    </DialogButton>
  );
}

export function CompleteFollowupButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => setOpen(true)}>
        Done
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Complete follow-up" size="sm">
        <ActionForm action={completeFollowupAction} extra={{ id }} submitLabel="Mark done" success="Follow-up completed" onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)}>
          <TextArea label="Outcome (optional)" name="outcome" rows={2} placeholder="e.g. Wants a revised quote with fewer centerpieces" />
        </ActionForm>
      </Dialog>
    </>
  );
}

const ACTIVITY: Option[] = [
  { value: "CALL", label: "Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Meeting" },
  { value: "NOTE", label: "Note" },
];

export function LogActivityButton({ leadId }: { leadId: string }) {
  return (
    <DialogButton label="Log activity" icon={MessageSquarePlus} size="sm" title="Log an activity" description="Calls, messages and meetings appear on the lead's timeline.">
      {(close) => (
        <ActionForm action={logActivityAction} extra={{ leadId }} submitLabel="Log" success="Activity logged" onSuccess={close} onCancel={close}>
          <SelectField label="Type" name="type" options={ACTIVITY} defaultValue="CALL" />
          <TextArea label="What happened" name="body" rows={3} required />
        </ActionForm>
      )}
    </DialogButton>
  );
}
