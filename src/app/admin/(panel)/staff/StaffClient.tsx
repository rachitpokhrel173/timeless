"use client";

import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CalendarX2, Pencil, Plus, Trash2 } from "lucide-react";
import { todayISO } from "@/lib/format";
import { ActionButton, ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField } from "@/components/admin/interactive";
import { archiveStaff, clearAvailability, saveStaff, setAvailability } from "./actions";

type StaffValues = { id?: string; name?: string; role?: string | null; phone?: string | null; email?: string | null; skills?: string[]; dailyRate?: number; notes?: string | null; active?: boolean };

export function StaffButton({ values }: { values?: StaffValues }) {
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
            <TextField label="Name" name="name" required defaultValue={values?.name} />
            <TextField label="Role" name="role" defaultValue={values?.role ?? ""} placeholder="Lead decorator" />
            <TextField label="Phone" name="phone" type="tel" defaultValue={values?.phone ?? ""} />
            <TextField label="Email" name="email" type="email" defaultValue={values?.email ?? ""} />
            <TextField label="Skills" name="skills" defaultValue={values?.skills?.join(", ") ?? ""} hint="Comma-separated: florals, rigging, lighting" wrapClassName="sm:col-span-2" />
            <TextField label="Daily rate (NPR)" name="dailyRate" type="number" min={0} defaultValue={values?.dailyRate ?? 0} hint="Used for event staff cost." />
            <CheckboxField name="active" label="Active" defaultChecked={values?.active ?? true} className="self-end" />
            <TextArea label="Notes" name="notes" rows={2} defaultValue={values?.notes ?? ""} wrapClassName="sm:col-span-2" />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function AvailabilityButton({ staffId }: { staffId: string }) {
  return (
    <DialogButton label="Mark unavailable" icon={CalendarX2} size="sm" title="Availability">
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
    <ConfirmButton icon={Archive} variant="ghost" confirmVariant="primary" title="Archive this team member?" body="They can't be assigned to new events; past events keep their record." confirmLabel="Archive" success="Archived" action={() => archiveStaff({ id, archived: true })}>
      Archive
    </ConfirmButton>
  );
}
