"use client";

import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { ActionForm, CheckboxField, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { createCustomer, saveContact, updateCustomer } from "./actions";

export type CustomerValues = { id?: string; name?: string; phone?: string | null; email?: string | null; altPhone?: string | null; address?: string | null; sourceKey?: string | null; tags?: string[] };

export default function CustomerForm({ values = {}, sources, onDone }: { values?: CustomerValues; sources: Option[]; onDone?: () => void }) {
  const router = useRouter();
  const editing = !!values.id;
  return (
    <ActionForm
      action={editing ? updateCustomer : createCustomer}
      extra={editing ? { id: values.id } : undefined}
      submitLabel={editing ? "Save changes" : "Create customer"}
      success={editing ? "Customer updated" : "Customer created"}
      onCancel={onDone ?? (() => router.back())}
      onSuccess={(d) => {
        if (onDone) onDone();
        else if (d && typeof d === "object" && "id" in d) router.push(`/admin/customers/${d.id}`);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" defaultValue={values.name} required autoFocus={!editing} wrapClassName="sm:col-span-2" hint="A person or a company." />
        <TextField label="Phone" name="phone" type="tel" defaultValue={values.phone ?? ""} />
        <TextField label="Alternate phone" name="altPhone" type="tel" defaultValue={values.altPhone ?? ""} />
        <TextField label="Email" name="email" type="email" defaultValue={values.email ?? ""} />
        <SelectField label="How they found us" name="sourceKey" options={sources} placeholder="Unknown" defaultValue={values.sourceKey ?? ""} />
        <TextField label="Address" name="address" defaultValue={values.address ?? ""} wrapClassName="sm:col-span-2" />
        <TextField label="Tags" name="tags" defaultValue={values.tags?.join(", ") ?? ""} hint="Comma-separated, e.g. vip, corporate" wrapClassName="sm:col-span-2" />
      </div>
    </ActionForm>
  );
}

export function EditCustomerButton(props: { values: CustomerValues; sources: Option[] }) {
  return (
    <DialogButton label="Edit" icon={Pencil} title="Edit customer" dialogSize="lg">
      {(close) => <CustomerForm {...props} onDone={close} />}
    </DialogButton>
  );
}

type ContactValues = { id?: string; name?: string; relation?: string | null; phone?: string | null; email?: string | null; isPrimary?: boolean; notes?: string | null };

export function ContactButton({ customerId, values }: { customerId: string; values?: ContactValues }) {
  return (
    <DialogButton label={values?.id ? <span className="sr-only">Edit contact</span> : "Add contact"} icon={values?.id ? Pencil : Plus} size={values?.id ? "icon-sm" : "sm"} variant={values?.id ? "ghost" : "secondary"} title={values?.id ? "Edit contact" : "Add a contact"}>
      {(close) => (
        <ActionForm action={saveContact} extra={{ customerId, id: values?.id ?? null }} submitLabel="Save" success="Contact saved" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Name" name="name" defaultValue={values?.name} required />
            <TextField label="Relation / role" name="relation" defaultValue={values?.relation ?? ""} placeholder="Bride, father, HR manager…" />
            <TextField label="Phone" name="phone" type="tel" defaultValue={values?.phone ?? ""} />
            <TextField label="Email" name="email" type="email" defaultValue={values?.email ?? ""} />
            <TextArea label="Notes" name="notes" rows={2} defaultValue={values?.notes ?? ""} wrapClassName="sm:col-span-2" />
            <CheckboxField label="Primary contact" name="isPrimary" defaultChecked={values?.isPrimary} className="sm:col-span-2" />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}
