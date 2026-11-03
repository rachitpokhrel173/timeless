"use client";

import Link from "@/components/admin/Link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Link2, Mail, Plus, UserX, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Dialog, inputClass, useToast } from "@/components/admin/interactive";
import { shrink } from "@/components/admin/Upload";
import { createTeamMember, uploadStaffPhoto } from "./actions";

type Role = { key: string; name: string; description: string | null };
type Account = { id: string; label: string; email: string };
type Step = { step: string; ok: boolean; message: string };

const STEPS = ["Employee", "Login", "Role", "Review"] as const;
const EMPLOYMENT: Record<string, string> = { FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract", FREELANCE: "Freelance", INTERN: "Intern" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Form = {
  name: string;
  email: string;
  phone: string;
  employeeCode: string;
  role: string;
  department: string;
  skills: string;
  employmentType: string;
  joinedOn: string;
  dailyRate: string;
  notes: string;
  loginMode: "none" | "invite" | "link";
  loginEmail: string;
  loginUserId: string;
  roleKey: string;
};
const EMPTY: Form = {
  name: "",
  email: "",
  phone: "",
  employeeCode: "",
  role: "",
  department: "",
  skills: "",
  employmentType: "FULL_TIME",
  joinedOn: "",
  dailyRate: "",
  notes: "",
  loginMode: "invite",
  loginEmail: "",
  loginUserId: "",
  roleKey: "STAFF",
};

/**
 * Add team member: employee details → login (invite / link existing / none) → role → review.
 * The server creates the employee first and reports each later step separately, so a failed
 * invitation never loses the employee or creates a second account on retry.
 */
export function AddTeamMemberButton({ canInvite, canRates, roles, accounts, departments }: { canInvite: boolean; canRates: boolean; roles: Role[]; accounts: Account[]; departments: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
        Add team member
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add team member" size="lg">
        {open && <Wizard canInvite={canInvite} canRates={canRates} roles={roles} accounts={accounts} departments={departments} onClose={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function Wizard({ canInvite, canRates, roles, accounts, departments, onClose }: { canInvite: boolean; canRates: boolean; roles: Role[]; accounts: Account[]; departments: string[]; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>({ ...EMPTY, loginMode: canInvite ? "invite" : "none", roleKey: roles.some((r) => r.key === "STAFF") ? "STAFF" : (roles[0]?.key ?? "STAFF") });
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ id: string; steps: Step[] } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const toast = useToast();
  const router = useRouter();
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const loginEmail = (f.loginEmail || f.email).trim().toLowerCase();
  const account = accounts.find((a) => a.id === f.loginUserId);
  const role = roles.find((r) => r.key === f.roleKey);
  const steps = canInvite ? STEPS : (["Employee", "Review"] as const);
  const current = steps[step]!;

  function validate(name: string): Record<string, string> {
    const e: Record<string, string> = {};
    if (name === "Employee") {
      if (!f.name.trim()) e.name = "Full name is required.";
      if (f.email && !EMAIL.test(f.email.trim())) e.email = "Enter a valid email address.";
      if (f.phone && !/^\+?[\d\s()-]{7,}$/.test(f.phone.trim())) e.phone = "Enter a valid phone number.";
      if (f.employeeCode && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(f.employeeCode.trim())) e.employeeCode = "Letters, numbers, - and _ only.";
      if (f.dailyRate && !(Number(f.dailyRate) >= 0)) e.dailyRate = "Can't be negative.";
      if (photo && photo.size > 5 * 1024 * 1024) e.photo = "Photos must be 5 MB or smaller.";
    }
    if (name === "Login") {
      if (f.loginMode === "invite" && !EMAIL.test(loginEmail)) e.loginEmail = "Enter the email to send the invitation to.";
      if (f.loginMode === "link" && !f.loginUserId) e.loginUserId = "Choose the account to link.";
    }
    if (name === "Role" && f.loginMode !== "none" && !role) e.roleKey = "Choose a role.";
    return e;
  }

  function next() {
    const e = validate(current);
    setErrors(e);
    if (!Object.keys(e).length) setStep((s) => s + 1);
  }

  function submit() {
    setFormError(null);
    start(async () => {
      try {
        const r = await createTeamMember({
          name: f.name,
          email: f.email || null,
          phone: f.phone || null,
          employeeCode: f.employeeCode || null,
          role: f.role || null,
          department: f.department || null,
          skills: f.skills,
          employmentType: f.employmentType as "FULL_TIME",
          joinedOn: f.joinedOn || null,
          ...(canRates && f.dailyRate ? { dailyRate: Number(f.dailyRate) } : {}),
          notes: f.notes || null,
          loginMode: canInvite ? f.loginMode : "none",
          loginEmail: f.loginMode === "invite" ? loginEmail : null,
          loginUserId: f.loginMode === "link" ? f.loginUserId : null,
          roleKey: f.roleKey,
        });
        if (!r.ok) {
          setFormError(r.error);
          if (r.fieldErrors) {
            setErrors(r.fieldErrors);
            // Send them back to the step with the problem
            const where = Object.keys(r.fieldErrors)[0] ?? "";
            setStep(["loginEmail", "loginUserId"].includes(where) ? 1 : where === "roleKey" ? 2 : 0);
          }
          return;
        }
        const out = { ...r.data, steps: [...r.data.steps] };
        if (photo) {
          const form = new FormData();
          form.set("staffId", r.data.id);
          form.set("file", await shrink(photo));
          const up = await uploadStaffPhoto(form);
          out.steps.splice(1, 0, { step: "Photo", ok: up.ok, message: up.ok ? "Profile photo saved." : `Photo not saved: ${up.error} You can add it from their profile.` });
        }
        setResult(out);
        toast(out.steps.every((s) => s.ok) ? "success" : "error", out.steps.every((s) => s.ok) ? "Team member added" : "Added — but a step needs attention");
        router.refresh();
      } catch {
        setFormError("Couldn't reach the server. Check your connection — then look for the team member in the list before trying again.");
      }
    });
  }

  if (result)
    return (
      <div className="space-y-4">
        <ul className="space-y-2">
          {result.steps.map((s) => (
            <li key={s.step} className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]", s.ok ? "border-a-border" : "border-a-danger/40 bg-a-danger-soft")}>
              {s.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-a-success" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-a-danger" aria-hidden />}
              <span>
                <span className="block font-medium">{s.step}</span>
                {s.message}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          <Link href={`/admin/staff/${result.id}${result.steps.every((s) => s.ok) ? "" : "?tab=login"}`} className="inline-flex h-9 items-center rounded-md bg-a-accent px-3.5 text-[14px] font-medium text-white hover:opacity-90" onClick={onClose}>
            Open profile
          </Link>
        </div>
      </div>
    );

  return (
    <div className="space-y-5">
      <ol className="flex items-center gap-2 text-xs" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("inline-flex size-6 items-center justify-center rounded-full border font-semibold", i < step ? "border-a-success bg-a-success text-white" : i === step ? "border-a-accent text-a-accent" : "border-a-border text-a-muted")}>
              {i + 1}
            </span>
            <span className={cn(i === step ? "font-medium" : "text-a-muted", "hidden sm:inline")}>{s}</span>
            {i < steps.length - 1 && <span className="h-px w-5 bg-a-border" aria-hidden />}
          </li>
        ))}
      </ol>

      {formError && (
        <p role="alert" className="rounded-md bg-a-danger-soft px-3 py-2 text-[13px] text-a-danger">
          {formError}
        </p>
      )}

      {current === "Employee" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <In label="Full name" required value={f.name} onChange={set("name")} error={errors.name} autoFocus />
          <In label="Employee code" value={f.employeeCode} onChange={set("employeeCode")} error={errors.employeeCode} placeholder="TT-012" />
          <In label="Email" type="email" value={f.email} onChange={set("email")} error={errors.email} />
          <In label="Phone" type="tel" value={f.phone} onChange={set("phone")} error={errors.phone} />
          <In label="Job title" value={f.role} onChange={set("role")} placeholder="Lead decorator" />
          <label className="block text-[13px] font-medium">
            Department
            <input list="staff-departments" value={f.department} onChange={set("department")} className={cn(inputClass, "mt-1")} placeholder="Décor, Florals, Lighting…" />
            <datalist id="staff-departments">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="block text-[13px] font-medium">
            Employment type
            <select value={f.employmentType} onChange={set("employmentType")} className={cn(inputClass, "mt-1")}>
              {Object.entries(EMPLOYMENT).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <In label="Joining date" type="date" value={f.joinedOn} onChange={set("joinedOn")} />
          <In label="Skills" value={f.skills} onChange={set("skills")} hint="Comma-separated: florals, rigging, lighting" wrap="sm:col-span-2" />
          {canRates && <In label="Daily rate (NPR)" type="number" min={0} value={f.dailyRate} onChange={set("dailyRate")} error={errors.dailyRate} hint="Used for event staff cost." />}
          <label className="block text-[13px] font-medium">
            Profile photo <span className="font-normal text-a-muted">(optional)</span>
            <span className="mt-1 flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-a-border px-3 hover:bg-a-hover">
              <Camera className="size-4" aria-hidden />
              <span className="truncate">{photo ? photo.name : "Choose a photo"}</span>
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            {errors.photo && <span className="mt-1 block text-xs text-a-danger">{errors.photo}</span>}
          </label>
          <label className="block text-[13px] font-medium sm:col-span-2">
            Internal notes
            <textarea value={f.notes} onChange={set("notes")} rows={2} maxLength={2000} className={cn(inputClass, "mt-1 h-auto py-2")} />
          </label>
        </div>
      )}

      {current === "Login" && (
        <div className="space-y-3">
          <p className="text-[13px] text-a-muted">A login lets {f.name.split(" ")[0] || "them"} sign in and see only the work assigned to them. Passwords are never stored here — they choose their own from the invitation email.</p>
          <Choice active={f.loginMode === "invite"} onClick={() => setF((s) => ({ ...s, loginMode: "invite" }))} icon={<Mail className="size-4" />} title="Invite to create a login" body="Supabase sends an invitation email. If the email already has an account, that account is linked instead.">
            {f.loginMode === "invite" && <In label="Invitation email" type="email" value={f.loginEmail || f.email} onChange={set("loginEmail")} error={errors.loginEmail} />}
          </Choice>
          <Choice active={f.loginMode === "link"} onClick={() => setF((s) => ({ ...s, loginMode: "link" }))} icon={<Link2 className="size-4" />} title="Link an existing account" body="For someone who already signs in (for example a manager who also works events). Only accounts not linked to another team member are listed.">
            {f.loginMode === "link" &&
              (accounts.length === 0 ? (
                <p className="text-[13px] text-a-muted">No unlinked accounts.</p>
              ) : (
                <div className="space-y-2">
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className={inputClass} aria-label="Search accounts" />
                  <ul className="max-h-48 divide-y divide-a-border overflow-y-auto rounded-md border border-a-border">
                    {accounts
                      .filter((a) => a.label.toLowerCase().includes(search.toLowerCase()))
                      .slice(0, 50)
                      .map((a) => (
                        <li key={a.id}>
                          <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] hover:bg-a-hover">
                            <input type="radio" name="loginUserId" checked={f.loginUserId === a.id} onChange={() => setF((s) => ({ ...s, loginUserId: a.id }))} className="accent-[var(--a-accent)]" />
                            {a.label}
                          </label>
                        </li>
                      ))}
                  </ul>
                  {errors.loginUserId && <p className="text-xs text-a-danger">{errors.loginUserId}</p>}
                </div>
              ))}
          </Choice>
          <Choice active={f.loginMode === "none"} onClick={() => setF((s) => ({ ...s, loginMode: "none" }))} icon={<UserX className="size-4" />} title="No login for now" body="They can still be assigned to events and tasks. Invite them later from their profile." />
        </div>
      )}

      {current === "Role" &&
        (f.loginMode === "none" ? (
          <p className="text-[13px] text-a-muted">No login, so no role is needed. Continue to review.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-[13px] text-a-muted">The role decides what they can open. Field team members should normally be Staff — they see only their own tasks.</p>
            {roles.map((r) => (
              <label key={r.key} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]", f.roleKey === r.key ? "border-a-accent bg-a-accent-soft/40" : "border-a-border hover:bg-a-hover")}>
                <input type="radio" name="roleKey" checked={f.roleKey === r.key} onChange={() => setF((s) => ({ ...s, roleKey: r.key }))} className="mt-0.5 accent-[var(--a-accent)]" />
                <span>
                  <span className="block font-medium">
                    {r.name}
                    {(r.key === "ADMIN" || r.key === "SUPER_ADMIN") && <span className="ml-2 text-xs font-normal text-a-danger">Full office access</span>}
                  </span>
                  {r.description && <span className="text-a-muted">{r.description}</span>}
                </span>
              </label>
            ))}
            {roles.length === 1 && <p className="text-xs text-a-muted">Only an administrator can give other roles.</p>}
            {errors.roleKey && <p className="text-xs text-a-danger">{errors.roleKey}</p>}
          </div>
        ))}

      {current === "Review" && (
        <dl className="grid gap-x-4 gap-y-2 rounded-lg border border-a-border p-4 text-[13px] sm:grid-cols-[10rem_1fr]">
          {(
            [
              ["Name", f.name],
              ["Employee code", f.employeeCode.toUpperCase()],
              ["Job title", f.role],
              ["Department", f.department],
              ["Employment", `${EMPLOYMENT[f.employmentType]}${f.joinedOn ? ` · joined ${f.joinedOn}` : ""}`],
              ["Contact", [f.phone, f.email].filter(Boolean).join(" · ")],
              ["Skills", f.skills],
              ["Photo", photo?.name],
              ["Login", !canInvite || f.loginMode === "none" ? "No login" : f.loginMode === "invite" ? `Invite ${loginEmail}` : `Link ${account?.label ?? ""}`],
              ["Role", !canInvite || f.loginMode === "none" ? "—" : role?.name],
              ["Invitation", f.loginMode === "invite" && canInvite ? "Sent when you confirm (or the existing account is linked)" : "—"],
            ] as [string, string | undefined][]
          )
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-a-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
        </dl>
      )}

      <div className="flex flex-wrap justify-between gap-2 border-t border-a-border pt-4">
        {step > 0 ? (
          <Button icon={ArrowLeft} onClick={() => setStep((s) => s - 1)} disabled={pending}>
            Back
          </Button>
        ) : (
          <Button onClick={onClose}>Cancel</Button>
        )}
        {current === "Review" ? (
          <Button variant="primary" icon={CheckCircle2} pending={pending} onClick={submit}>
            Create team member
          </Button>
        ) : (
          <Button variant="primary" onClick={next}>
            Continue <ArrowRight className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

function In({ label, error, hint, wrap, required, ...props }: React.ComponentProps<"input"> & { label: string; error?: string; hint?: string; wrap?: string }) {
  return (
    <label className={cn("block text-[13px] font-medium", wrap)}>
      {label}
      {required && <span className="text-a-danger"> *</span>}
      <input {...props} aria-invalid={!!error || undefined} className={cn(inputClass, "mt-1")} />
      {error ? <span className="mt-1 block text-xs text-a-danger">{error}</span> : hint && <span className="mt-1 block text-xs font-normal text-a-muted">{hint}</span>}
    </label>
  );
}

function Choice({ active, onClick, icon, title, body, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border p-3", active ? "border-a-accent bg-a-accent-soft/30" : "border-a-border")}>
      <button type="button" onClick={onClick} className="flex w-full items-start gap-2.5 text-left" aria-pressed={active}>
        <span className={cn("mt-0.5", active ? "text-a-accent" : "text-a-muted")}>{icon}</span>
        <span className="text-[13px]">
          <span className="block font-medium">{title}</span>
          <span className="text-a-muted">{body}</span>
        </span>
      </button>
      {children && <div className="mt-3 pl-6">{children}</div>}
    </div>
  );
}
