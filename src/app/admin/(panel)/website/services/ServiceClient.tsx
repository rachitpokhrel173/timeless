"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import MediaPicker, { type MediaOption } from "@/components/admin/MediaPicker";
import { ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { deleteServiceItem, saveService, saveServiceItem } from "./actions";

type ServiceValues = { id?: string; name?: string; slug?: string; summary?: string; description?: string; imageId?: string | null; eventType?: string | null; featured?: boolean; status?: string; position?: number };

export function ServiceButton({ values, media, eventTypes }: { values?: ServiceValues; media: MediaOption[]; eventTypes: Option[] }) {
  const editing = !!values?.id;
  return (
    <DialogButton label={editing ? "Edit" : "Add service"} icon={editing ? Pencil : Plus} size={editing ? "sm" : "md"} variant={editing ? "secondary" : "primary"} title={editing ? `Edit ${values?.name}` : "New service"} dialogSize="lg">
      {(close) => (
        <ActionForm action={saveService} extra={{ id: values?.id ?? null }} success="Service saved" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Name" name="name" required defaultValue={values?.name} placeholder="Wedding Decoration" />
            <TextField label="URL name" name="slug" defaultValue={values?.slug} hint="Used in /services#…" />
            <TextField label="Summary" name="summary" required defaultValue={values?.summary} wrapClassName="sm:col-span-2" />
            <TextArea label="Description" name="description" required rows={5} defaultValue={values?.description} wrapClassName="sm:col-span-2" />
            <MediaPicker name="imageId" label="Image" media={media} defaultValue={values?.imageId} />
            <div className="space-y-3">
              <SelectField label="Event type" name="eventType" options={eventTypes} placeholder="—" defaultValue={values?.eventType ?? ""} hint="Pre-selects it on the inquiry form." />
              <SelectField
                label="Status"
                name="status"
                defaultValue={values?.status ?? "PUBLISHED"}
                options={[
                  { value: "PUBLISHED", label: "Published" },
                  { value: "DRAFT", label: "Draft" },
                  { value: "ARCHIVED", label: "Archived" },
                ]}
              />
              <TextField label="Order" name="position" type="number" defaultValue={values?.position ?? 0} />
            </div>
            <CheckboxField name="featured" label="Featured" defaultChecked={values?.featured} />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ServiceItemButton({ serviceId, values }: { serviceId: string; values?: { id: string; title: string; description: string | null; position: number } }) {
  return (
    <DialogButton label={values ? <span className="sr-only">Edit</span> : "Add item"} icon={values ? Pencil : Plus} size={values ? "icon-sm" : "sm"} variant={values ? "ghost" : "secondary"} title={values ? "Edit item" : "Add what's included"}>
      {(close) => (
        <ActionForm action={saveServiceItem} extra={{ serviceId, id: values?.id ?? null }} success="Saved" onSuccess={close} onCancel={close}>
          <TextField label="Title" name="title" required defaultValue={values?.title} placeholder="Mandap & stage design" />
          <TextArea label="Description" name="description" rows={2} defaultValue={values?.description ?? ""} />
          <TextField label="Order" name="position" type="number" defaultValue={values?.position ?? 0} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function DeleteServiceItemButton({ id }: { id: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title="Remove this item?" confirmLabel="Remove" action={() => deleteServiceItem({ id })}>
      <span className="sr-only">Remove</span>
    </ConfirmButton>
  );
}
