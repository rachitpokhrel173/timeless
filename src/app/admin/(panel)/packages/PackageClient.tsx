"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import MediaPicker, { type MediaOption } from "@/components/admin/MediaPicker";
import { ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { createPackage, deletePackageItem, savePackageItem, updatePackage } from "./actions";

export type PackageValues = {
  id?: string;
  name?: string;
  slug?: string;
  tier?: string | null;
  summary?: string | null;
  description?: string | null;
  price?: number;
  priceFrom?: boolean;
  features?: string[];
  imageId?: string | null;
  eventType?: string | null;
  status?: string;
  featured?: boolean;
  position?: number;
};

const STATUS: Option[] = [
  { value: "DRAFT", label: "Draft — hidden from the website" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived — not offered" },
];

export function PackageForm({ values = {}, media, eventTypes, onDone }: { values?: PackageValues; media: MediaOption[]; eventTypes: Option[]; onDone?: () => void }) {
  const editing = !!values.id;
  return (
    <ActionForm action={editing ? updatePackage : createPackage} extra={editing ? { id: values.id } : undefined} submitLabel={editing ? "Save package" : "Create package"} success={editing ? "Package saved" : "Package created"} onSuccess={onDone} onCancel={onDone}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" required defaultValue={values.name} placeholder="Signature" />
        <TextField label="Tier label" name="tier" defaultValue={values.tier ?? ""} placeholder="Signature" />
        <TextField label="Price (NPR)" name="price" type="number" min={0} defaultValue={values.price ?? 0} hint="Starting price used on quotations." />
        <SelectField label="Event type" name="eventType" options={eventTypes} placeholder="Any event" defaultValue={values.eventType ?? ""} />
        <TextField label="Summary" name="summary" defaultValue={values.summary ?? ""} wrapClassName="sm:col-span-2" placeholder="Elegant event styling" />
        <TextArea label="What's included (one per line)" name="features" rows={5} defaultValue={values.features?.join("\n") ?? ""} wrapClassName="sm:col-span-2" />
        <TextArea label="Description" name="description" rows={3} defaultValue={values.description ?? ""} wrapClassName="sm:col-span-2" />
        <MediaPicker name="imageId" label="Image" media={media} defaultValue={values.imageId} />
        <div className="space-y-3">
          <SelectField label="Status" name="status" options={STATUS} defaultValue={values.status ?? "DRAFT"} />
          <TextField label="Order" name="position" type="number" defaultValue={values.position ?? 0} />
        </div>
        <CheckboxField name="priceFrom" label="Show as “from” price" defaultChecked={values.priceFrom ?? true} />
        <CheckboxField name="featured" label="Feature on the homepage" hint="The homepage shows up to three featured, published packages with an image." defaultChecked={values.featured} />
      </div>
    </ActionForm>
  );
}

export function EditPackageButton(props: { values: PackageValues; media: MediaOption[]; eventTypes: Option[] }) {
  return (
    <DialogButton label="Edit package" icon={Pencil} title="Edit package" dialogSize="lg">
      {(close) => <PackageForm {...props} onDone={close} />}
    </DialogButton>
  );
}

export function NewPackageButton(props: { media: MediaOption[]; eventTypes: Option[] }) {
  return (
    <DialogButton label="New package" icon={Plus} variant="primary" title="New package" dialogSize="lg">
      {(close) => <PackageForm {...props} onDone={close} />}
    </DialogButton>
  );
}

export function PackageItemButton({ packageId, items, values }: { packageId: string; items: Option[]; values?: { id: string; label: string; inventoryItemId: string | null; quantity: number } }) {
  return (
    <DialogButton label={values ? <span className="sr-only">Edit line</span> : "Add item"} icon={values ? Pencil : Plus} size={values ? "icon-sm" : "sm"} variant={values ? "ghost" : "secondary"} title={values ? "Edit package item" : "Add to package"}>
      {(close) => (
        <ActionForm action={savePackageItem} extra={{ packageId, id: values?.id ?? null }} success="Saved" onSuccess={close} onCancel={close}>
          <TextField label="What's included" name="label" required defaultValue={values?.label} placeholder="Floral stage backdrop" />
          <SelectField label="Inventory item" name="inventoryItemId" options={items} placeholder="Not tracked in inventory" defaultValue={values?.inventoryItemId ?? ""} hint="Linked items are reserved automatically when this package is booked." />
          <TextField label="Quantity" name="quantity" type="number" min={1} defaultValue={values?.quantity ?? 1} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function DeletePackageItemButton({ id, label }: { id: string; label: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title={`Remove “${label}”?`} confirmLabel="Remove" success="Removed" action={() => deletePackageItem({ id })}>
      <span className="sr-only">Remove {label}</span>
    </ConfirmButton>
  );
}
