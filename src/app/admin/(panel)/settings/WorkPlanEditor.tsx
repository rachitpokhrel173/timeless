"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, ConfirmButton, Dialog, inputClass, useRun, type Option } from "@/components/admin/interactive";
import { TEAM_ROLES, type WorkPlan, type WorkStep } from "@/lib/defaults";
import { deleteWorkPlan, saveWorkPlan } from "./actions";

const PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];
const DAY_OPTIONS = Array.from({ length: 21 }, (_, i) => i - 14).map((d) => ({ value: String(d), label: d === 0 ? "Event day" : d < 0 ? `${-d} day${d === -1 ? "" : "s"} before` : `${d} day${d === 1 ? "" : "s"} after` }));
const blank = (): WorkStep => ({ day: 0, time: "09:00", title: "", role: null, priority: "MEDIUM", details: null });

/** Add or edit a work plan: a named list of steps, each a day relative to the event, a time and a team role. */
export function WorkPlanButton({ plan, eventTypes }: { plan?: WorkPlan; eventTypes: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={plan ? "icon-sm" : "sm"} variant={plan ? "ghost" : "secondary"} icon={plan ? Pencil : Plus} onClick={() => setOpen(true)}>
        {plan ? <span className="sr-only">Edit {plan.name}</span> : "Add work plan"}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={plan ? "Edit work plan" : "New work plan"} description="Each step becomes a dated task when the plan is added to an event." size="xl">
        {open && <Editor plan={plan} eventTypes={eventTypes} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function Editor({ plan, eventTypes, onDone }: { plan?: WorkPlan; eventTypes: Option[]; onDone: () => void }) {
  const [name, setName] = useState(plan?.name ?? "");
  const [types, setTypes] = useState<string[]>(plan?.eventTypes ?? []);
  const [steps, setSteps] = useState<WorkStep[]>(plan?.steps.length ? plan.steps : [blank()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { run, pending } = useRun();

  const update = (i: number, patch: Partial<WorkStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) =>
    setSteps((s) => {
      const next = [...s];
      const [x] = next.splice(i, 1);
      next.splice(i + by, 0, x!);
      return next;
    });

  const save = () =>
    run(() => saveWorkPlan({ id: plan?.id ?? null, name, eventTypes: types, steps }), {
      success: "Work plan saved",
      onSuccess: onDone,
      onError: (r) => setErrors(r.fieldErrors ?? {}),
    });

  return (
    <div className="space-y-5">
      <datalist id="plan-team-roles">
        {TEAM_ROLES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <label className="block text-[13px] font-medium">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} mt-1`} placeholder="Wedding decoration" aria-invalid={!!errors.name} />
        {errors.name && <span className="mt-1 block text-xs text-a-danger">{errors.name}</span>}
      </label>
      <fieldset>
        <legend className="text-[13px] font-medium">Used for</legend>
        <p className="text-xs text-a-muted">Pick event types, or none to use this plan for every type without its own plan.</p>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {eventTypes.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={types.includes(o.value)}
                onChange={(e) => setTypes((t) => (e.target.checked ? [...t, o.value] : t.filter((x) => x !== o.value)))}
                className="size-4 accent-[var(--a-accent)]"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-2 text-[13px] font-medium">Steps</p>
        {errors.steps && <p className="mb-2 text-xs text-a-danger">{errors.steps}</p>}
        <ol className="space-y-2">
          {steps.map((s, i) => {
            const err = (k: string) => errors[`steps.${i}.${k}`];
            return (
              <li key={i} className="rounded-lg border border-a-border p-3">
                <div className="grid gap-2 sm:grid-cols-[150px_100px_1fr]">
                  <select aria-label="Day" value={String(s.day)} onChange={(e) => update(i, { day: Number(e.target.value) })} className={inputClass}>
                    {DAY_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <input aria-label="Time" type="time" value={s.time} onChange={(e) => update(i, { time: e.target.value })} className={inputClass} aria-invalid={!!err("time")} />
                  <input aria-label="Task" value={s.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Stage and backdrop decoration" className={inputClass} aria-invalid={!!err("title")} />
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[150px_100px_1fr_auto]">
                  <input aria-label="Team role" list="plan-team-roles" value={s.role ?? ""} onChange={(e) => update(i, { role: e.target.value || null })} placeholder="Team role" className={inputClass} />
                  <select aria-label="Priority" value={s.priority} onChange={(e) => update(i, { priority: e.target.value as WorkStep["priority"] })} className={inputClass}>
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <input aria-label="Details" value={s.details ?? ""} onChange={(e) => update(i, { details: e.target.value || null })} placeholder="Details for the team (optional)" className={inputClass} />
                  <span className="flex">
                    <Button size="icon-sm" variant="ghost" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)}>
                      <span className="sr-only">Move up</span>
                    </Button>
                    <Button size="icon-sm" variant="ghost" icon={ArrowDown} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                      <span className="sr-only">Move down</span>
                    </Button>
                    <Button size="icon-sm" variant="danger-ghost" icon={Trash2} disabled={steps.length === 1} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>
                      <span className="sr-only">Remove step</span>
                    </Button>
                  </span>
                </div>
                {(err("title") || err("time")) && <p className="mt-1 text-xs text-a-danger">{err("title") ?? err("time")}</p>}
              </li>
            );
          })}
        </ol>
        <Button size="sm" icon={Plus} className="mt-2" onClick={() => setSteps((s) => [...s, { ...blank(), day: s.at(-1)?.day ?? 0 }])}>
          Add step
        </Button>
      </div>

      <div className="flex justify-end gap-2 border-t border-a-border pt-4">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" pending={pending} onClick={save}>
          Save plan
        </Button>
      </div>
    </div>
  );
}

export function DeleteWorkPlanButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title={`Delete “${name}”?`} body="Tasks already added to events stay." confirmLabel="Delete" success="Work plan deleted" action={() => deleteWorkPlan({ id })}>
      <span className="sr-only">Delete</span>
    </ConfirmButton>
  );
}
