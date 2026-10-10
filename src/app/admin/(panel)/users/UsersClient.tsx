"use client";

import { useState } from "react";
import { KeyRound, Pencil, Plus, Trash2, UserCheck, UserX } from "lucide-react";
import { ActionButton, ActionForm, Button, CheckboxGroup, ConfirmButton, DialogButton, SelectField, TextArea, TextField, useRun, type Option } from "@/components/admin/interactive";
import { deleteRole, inviteUser, linkStaff, saveRole, setRolePermissions, setUserActive, setUserRoles } from "./actions";

export function InviteButton({ roles, staff }: { roles: Option[]; staff: Option[] }) {
  return (
    <DialogButton label="Invite user" icon={Plus} variant="primary" title="Invite an admin user" description="They get an email to choose their own password.">
      {(close) => (
        <ActionForm action={inviteUser} submitLabel="Send invitation" success="Invitation sent" onSuccess={close} onCancel={close}>
          <TextField label="Name" name="fullName" required />
          <TextField label="Email" name="email" type="email" required />
          <SelectField label="Role" name="roleId" options={roles} required placeholder="Choose a role" />
          <SelectField label="Team member record" name="staffId" options={staff} placeholder="None" hint="Link to see their assigned tasks." />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function UserRolesButton({ userId, roles, current }: { userId: string; roles: Option[]; current: string[] }) {
  return (
    <DialogButton label={<span className="sr-only">Change roles</span>} icon={KeyRound} size="icon-sm" variant="ghost" title="Roles">
      {(close) => (
        <ActionForm action={setUserRoles} extra={{ userId }} success="Roles updated" onSuccess={close} onCancel={close}>
          <CheckboxGroup label="This user can act as" name="roleIds" options={roles} defaultValue={current} />
          <p className="text-xs text-a-muted">A user with several roles gets every permission from all of them.</p>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function LinkStaffButton({ userId, staff, current }: { userId: string; staff: Option[]; current: string | null }) {
  return (
    <DialogButton label={<span className="sr-only">Team member link</span>} icon={Pencil} size="icon-sm" variant="ghost" title="Linked team member">
      {(close) => (
        <ActionForm action={linkStaff} extra={{ userId }} success="Saved" onSuccess={close} onCancel={close}>
          <SelectField label="Team member" name="staffId" options={staff} placeholder="None" defaultValue={current ?? ""} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ActiveButton({ userId, active }: { userId: string; active: boolean }) {
  return active ? (
    <ConfirmButton size="icon-sm" icon={UserX} title="Deactivate this user?" body="They lose access immediately. Their history is kept and you can reactivate them later." confirmLabel="Deactivate" success="Deactivated" action={() => setUserActive({ userId, active: false })}>
      <span className="sr-only">Deactivate</span>
    </ConfirmButton>
  ) : (
    <ActionButton size="icon-sm" variant="ghost" icon={UserCheck} aria-label="Reactivate" action={() => setUserActive({ userId, active: true })} success="Reactivated" />
  );
}

export function RoleButton({ values }: { values?: { id: string; name: string; description: string | null } }) {
  return (
    <DialogButton label={values ? <span className="sr-only">Rename role</span> : "New role"} icon={values ? Pencil : Plus} size={values ? "icon-sm" : "md"} variant={values ? "ghost" : "secondary"} title={values ? "Edit role" : "New role"}>
      {(close) => (
        <ActionForm action={saveRole} extra={{ id: values?.id ?? null }} success="Saved" onSuccess={close} onCancel={close}>
          <TextField label="Name" name="name" required defaultValue={values?.name} />
          <TextArea label="Description" name="description" rows={2} defaultValue={values?.description ?? ""} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function DeleteRoleButton({ id }: { id: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title="Delete this role?" confirmLabel="Delete" success="Role deleted" action={() => deleteRole({ id })}>
      <span className="sr-only">Delete role</span>
    </ConfirmButton>
  );
}

/** Permission matrix for one role. */
export function PermissionEditor({ roleId, groups, current, locked }: { roleId: string; groups: { group: string; items: { key: string; label: string }[] }[]; current: string[]; locked: boolean }) {
  const [on, setOn] = useState(new Set(current));
  const { run, pending } = useRun();
  const dirty = on.size !== current.length || current.some((k) => !on.has(k));
  const toggle = (k: string) =>
    setOn((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <fieldset key={g.group} className="rounded-lg border border-a-border p-3">
            <legend className="px-1 text-xs font-semibold tracking-wide text-a-muted uppercase">{g.group}</legend>
            <ul className="space-y-1.5">
              {g.items.map((p) => (
                <li key={p.key}>
                  <label className="flex items-start gap-2 text-[13px]">
                    <input type="checkbox" checked={locked || on.has(p.key)} disabled={locked} onChange={() => toggle(p.key)} className="mt-0.5 size-4 accent-[var(--a-accent)]" />
                    <span>
                      {p.label}
                      <span className="block text-[11px] text-a-muted">{p.key}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>
      {!locked && (
        <div className="mt-4 flex items-center justify-end gap-2">
          {dirty && <span className="mr-auto text-xs text-a-warning">Unsaved changes</span>}
          <Button variant="primary" pending={pending} disabled={!dirty} onClick={() => run(() => setRolePermissions({ roleId, permissions: [...on] }), { success: "Permissions saved" })}>
            Save permissions
          </Button>
        </div>
      )}
    </div>
  );
}
