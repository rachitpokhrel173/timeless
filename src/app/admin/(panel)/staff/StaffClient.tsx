"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, CalendarX2, CheckCircle2, KeyRound, Link2, Mail, Pencil, Plus, RefreshCw, Trash2, Unlink, UserCheck, UserX, XCircle } from "lucide-react";
import { todayISO } from "@/lib/format";
import { ActionButton, ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import UploadButton from "@/components/admin/Upload";
import {
  archiveStaff,
  changeStaffRole,
  clearAvailability,
  inviteStaffLogin,
  linkExistingLogin,
  resendStaffInvitation,
  saveStaff,
  setAvailability,
  setStaffLoginActive,
  unlinkStaffLogin,
  uploadStaffPhoto,
} from "./actions";
import { approveTask, requestRevisions } from "./review-actions";

type StaffValues = {
  id?: string;
  name?: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  skills?: string[];
  dailyRate?: number;
  notes?: string | null;
  active?: boolean;
  employeeCode?: string | null;
  department?: string | null;
  employmentType?: string | null;
  joinedOn?: string | null;
};

const EMPLOYMENT: Option[] = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "FREELANCE", label: "Freelance" },
  { value: "INTERN", label: "Intern" },
];

export function StaffButton({ values, canRates = false }: { values?: StaffValues; canRates?: boolean }) {
  const router = useRouter();
  const editing = !!values?.id;
  return (
    <DialogButton label={editing ? "Edit" : "Add team member"} icon={editing ? Pencil : Plus} variant={editing ? "secondary" : "primary"} title={editing ? "Edit team member" : "New team member"} dialogSize="lg">
      {(close) => (
        <ActionForm
          action={saveStaff}
          extra={{ id: values?.id ?? null }}
          success="Saved"
          onCancel={close}
          onSuccess={(d) => {
            close();
            if (!editing) router.push(`/admin/staff/${(d as { id: string }).id}`);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" name="name" required defaultValue={values?.name} />
            <TextField label="Employee code" name="employeeCode" defaultValue={values?.employeeCode ?? ""} placeholder="TT-012" />
            <TextField label="Job title" name="role" defaultValue={values?.role ?? ""} placeholder="Lead decorator" />
            <TextField label="Department" name="department" defaultValue={values?.department ?? ""} />
            <SelectField label="Employment type" name="employmentType" options={EMPLOYMENT} placeholder="Not set" defaultValue={values?.employmentType ?? ""} />
            <TextField label="Joining date" name="joinedOn" type="date" defaultValue={values?.joinedOn ?? ""} />
            <TextField label="Phone" name="phone" type="tel" defaultValue={values?.phone ?? ""} />
            <TextField label="Email" name="email" type="email" defaultValue={values?.email ?? ""} />
            <TextField label="Skills" name="skills" defaultValue={values?.skills?.join(", ") ?? ""} hint="Comma-separated: florals, rigging, lighting" wrapClassName="sm:col-span-2" />
            {canRates && <TextField label="Daily rate (NPR)" name="dailyRate" type="number" min={0} defaultValue={values?.dailyRate ?? 0} hint="Used for event staff cost." />}
            <CheckboxField name="active" label="Active (can be assigned work)" defaultChecked={values?.active ?? true} className="self-end" />
            <TextArea label="Internal notes" name="notes" rows={2} defaultValue={values?.notes ?? ""} wrapClassName="sm:col-span-2" />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function StaffPhotoButton({ staffId, hasPhoto }: { staffId: string; hasPhoto: boolean }) {
  return <UploadButton action={uploadStaffPhoto} fields={{ staffId }} label={hasPhoto ? "Change photo" : "Add photo"} accept="image/png,image/jpeg,image/webp" multiple={false} size="sm" success="Photo saved" />;
}

export function AvailabilityButton({ staffId }: { staffId: string }) {
  return (
    <DialogButton label="Set availability" icon={CalendarX2} size="sm" title="Availability">
      {(close) => (
        <ActionForm action={setAvailability} extra={{ staffId }} success="Availability saved" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="From" name="date" type="date" required defaultValue={todayISO()} />
            <TextField label="Until (optional)" name="until" type="date" />
            <SelectField
              label="Status"
              name="status"
              defaultValue="UNAVAILABLE"
              options={[
                { value: "UNAVAILABLE", label: "Unavailable" },
                { value: "LEAVE", label: "On leave" },
                { value: "AVAILABLE", label: "Available (override)" },
              ]}
            />
            <div />
            <TextField label="From time" name="startTime" type="time" hint="Leave empty for the whole day." />
            <TextField label="To time" name="endTime" type="time" />
            <TextField label="Note" name="note" wrapClassName="sm:col-span-2" />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ClearAvailabilityButton({ id }: { id: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title="Remove this entry?" confirmLabel="Remove" action={() => clearAvailability({ id })}>
      <span className="sr-only">Remove</span>
    </ConfirmButton>
  );
}

export function ArchiveStaffButton({ id, archived }: { id: string; archived: boolean }) {
  return archived ? (
    <ActionButton icon={ArchiveRestore} action={() => archiveStaff({ id, archived: false })} success="Restored">
      Restore
    </ActionButton>
  ) : (
    <ConfirmButton icon={Archive} variant="ghost" confirmVariant="primary" title="Archive this team member?" body="They can't be assigned new work; their events, tasks and history are kept. Their login (if any) keeps its current state — suspend it separately." confirmLabel="Archive" success="Archived" action={() => archiveStaff({ id, archived: true })}>
      Archive
    </ConfirmButton>
  );
}

/* ───────── Login & permissions ───────── */

type Step = { step: string; ok: boolean; message: string };

/** Shows what happened at each step of an invite/link, instead of a single toast that could hide a partial failure. */
function Steps({ steps, onClose }: { steps: Step[]; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.step} className="flex items-start gap-2 text-[13px]">
            {s.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-a-success" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-a-danger" aria-hidden />}
            <span>
              <span className="font-medium">{s.step}: </span>
              {s.message}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="h-9 rounded-md border border-a-border px-3.5 text-[14px] hover:bg-a-hover">
          Done
        </button>
      </div>
    </div>
  );
}

function RoleSelect({ roles }: { roles: Option[] }) {
  return roles.length > 1 ? (
    <SelectField label="Role" name="roleKey" options={roles} defaultValue={roles.some((r) => r.value === "STAFF") ? "STAFF" : roles[0]?.value} required />
  ) : (
    <p className="text-[13px] text-a-muted">They get the Staff role — their own tasks only. An administrator can change it later.</p>
  );
}

export function InviteLoginButton({ staffId, email, roles, label = "Invite to sign in" }: { staffId: string; email: string | null; roles: Option[]; label?: string }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  return (
    <DialogButton label={label} icon={Mail} variant="primary" size="sm" title="Invite to sign in" description="Supabase emails them a link to choose their own password.">
      {(close) =>
        steps ? (
          <Steps steps={steps} onClose={close} />
        ) : (
          <ActionForm action={inviteStaffLogin} extra={{ staffId }} submitLabel="Send invitation" success={false} onSuccess={(d) => setSteps((d as { steps: Step[] }).steps)} onCancel={close}>
            <TextField label="Email" name="email" type="email" required defaultValue={email ?? ""} />
            <RoleSelect roles={roles} />
          </ActionForm>
        )
      }
    </DialogButton>
  );
}

export function LinkLoginButton({ staffId, accounts, roles }: { staffId: string; accounts: Option[]; roles: Option[] }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  return (
    <DialogButton label="Link existing account" icon={Link2} size="sm" title="Link an existing account" description="Only accounts not linked to another team member, and never client logins.">
      {(close) =>
        steps ? (
          <Steps steps={steps} onClose={close} />
        ) : accounts.length === 0 ? (
          <p className="text-[13px] text-a-muted">There are no unlinked accounts. Invite them instead.</p>
        ) : (
          <ActionForm action={linkExistingLogin} extra={{ staffId }} submitLabel="Link account" success={false} onSuccess={(d) => setSteps((d as { steps: Step[] }).steps)} onCancel={close}>
            <SelectField label="Account" name="userId" options={accounts} required placeholder="Choose an account" />
            <RoleSelect roles={roles} />
          </ActionForm>
        )
      }
    </DialogButton>
  );
}

export function ResendInvitationButton({ staffId }: { staffId: string }) {
  return (
    <ActionButton size="sm" icon={RefreshCw} action={() => resendStaffInvitation({ staffId })} success="Invitation sent again">
      Resend invitation
    </ActionButton>
  );
}

export function UnlinkLoginButton({ staffId }: { staffId: string }) {
  return (
    <ConfirmButton size="sm" icon={Unlink} title="Unlink this login?" body="The account and its role stay, but it no longer shows this person's work. You can link it again later." confirmLabel="Unlink" success="Login unlinked" action={() => unlinkStaffLogin({ staffId })}>
      Unlink
    </ConfirmButton>
  );
}

export function SuspendLoginButton({ staffId, active }: { staffId: string; active: boolean }) {
  return active ? (
    <ConfirmButton size="sm" icon={UserX} title="Suspend their login?" body="They're signed out of everything at their next request and can't sign in. Their tasks, photos and history are kept." confirmLabel="Suspend" success="Login suspended" action={() => setStaffLoginActive({ staffId, active: false })}>
      Suspend access
    </ConfirmButton>
  ) : (
    <ActionButton size="sm" icon={UserCheck} action={() => setStaffLoginActive({ staffId, active: true })} success="Access restored">
      Reactivate access
    </ActionButton>
  );
}

export function ChangeRoleButton({ staffId, roles, current }: { staffId: string; roles: Option[]; current: string | null }) {
  return (
    <DialogButton label="Change role" icon={KeyRound} size="sm" title="Change role" description="Replaces their current role. The change applies on their next page load.">
      {(close) => (
        <ActionForm action={changeStaffRole} extra={{ staffId }} success="Role changed" onSuccess={close} onCancel={close}>
          <SelectField label="Role" name="roleKey" options={roles} defaultValue={current ?? ""} required placeholder="Choose a role" />
        </ActionForm>
      )}
    </DialogButton>
  );
}

/* ───────── Manager review ───────── */

export function ReviewButtons({ taskId, title }: { taskId: string; title: string }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <DialogButton label="Approve" icon={CheckCircle2} variant="primary" size="sm" title="Approve this work" description={title}>
        {(close) => (
          <ActionForm action={approveTask} extra={{ taskId }} submitLabel="Approve & complete" success="Approved — the team has been told" onSuccess={close} onCancel={close}>
            <TextArea label="Note for the team (optional)" name="note" rows={2} />
          </ActionForm>
        )}
      </DialogButton>
      <DialogButton label="Request changes" icon={RefreshCw} size="sm" title="Request changes" description={title}>
        {(close) => (
          <ActionForm action={requestRevisions} extra={{ taskId }} submitLabel="Send back" success="Sent back with your notes" onSuccess={close} onCancel={close}>
            <TextArea label="What needs changing" name="note" rows={3} required />
          </ActionForm>
        )}
      </DialogButton>
    </span>
  );
}
