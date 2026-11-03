"use client";

import { Archive, ArrowDown, ArrowUp, Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import MediaPicker, { MediaMultiPicker, type MediaOption } from "@/components/admin/MediaPicker";
import { ActionButton, ActionForm, CheckboxField, CheckboxGroup, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { createPackage, deletePackageItem, duplicatePackage, movePackage, savePackageItem, setPackageStatus, updatePackage } from "./actions";

export type PackageValues = {
  id?: string;
  name?: string;
  slug?: string;
  tier?: string | null;
  category?: string | null;
  summary?: string | null;
  description?: string | null;
  price?: number;
  priceFrom?: boolean;
  features?: string[];
  addOns?: { label: string; price: number }[];
  imageId?: string | null;
  galleryIds?: string[];
  serviceIds?: string[];
  eventType?: string | null;
  featured?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  publishedAt?: Date | string | null;
};

type FormProps = { values?: PackageValues; media: MediaOption[]; eventTypes: Option[]; services: Option[]; onDone?: () => void };

export function PackageForm({ values = {}, media, eventTypes, services, onDone }: FormProps) {
  const editing = !!values.id;
  const locked = !!values.publishedAt;
  return (
    <ActionForm
      action={editing ? updatePackage : createPackage}
      extra={editing ? { id: values.id } : undefined}
      submitLabel={editing ? "Save package" : "Create draft"}
      success={editing ? "Package saved — quotations already sent keep their own copy" : "Package created as a draft"}
      onSuccess={onDone}
      onCancel={onDone}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" required defaultValue={values.name} placeholder="Signature" />
        <TextField label="URL name" name="slug" defaultValue={values.slug} readOnly={locked} hint={locked ? `Locked: /packages/${values.slug}` : "Used in /packages/… — locked after the first publish."} />
        <TextField label="Tier label" name="tier" defaultValue={values.tier ?? ""} placeholder="Signature" />
        <TextField label="Category" name="category" defaultValue={values.category ?? ""} placeholder="Wedding" />
        <TextField label="Price (NPR)" name="price" type="number" min={0} defaultValue={values.price ?? 0} hint="Copied onto quotations when the package is used." />
        <SelectField label="Event type" name="eventType" options={eventTypes} placeholder="Any event" defaultValue={values.eventType ?? ""} />
        <TextField label="Summary" name="summary" defaultValue={values.summary ?? ""} wrapClassName="sm:col-span-2" placeholder="Elegant event styling" />
        <TextArea label="What's included (one per line)" name="features" rows={5} defaultValue={values.features?.join("\n") ?? ""} wrapClassName="sm:col-span-2" hint="Empty = the package contents listed below." />
        <TextArea
          label="Optional add-ons (one per line)"
          name="addOns"
          rows={3}
          defaultValue={values.addOns?.map((a) => (a.price ? `${a.label} | ${a.price}` : a.label)).join("\n") ?? ""}
          wrapClassName="sm:col-span-2"
          hint="“Photo booth | 15000” — the price is optional."
        />
        <TextArea label="Description" name="description" rows={3} defaultValue={values.description ?? ""} wrapClassName="sm:col-span-2" />
        <MediaPicker name="imageId" label="Cover image" media={media} defaultValue={values.imageId} />
        <div className="space-y-3">
          <CheckboxField name="priceFrom" label="Show as “from” price" defaultChecked={values.priceFrom ?? true} />
          <CheckboxField name="featured" label="Feature on the homepage" hint="The homepage shows up to three featured, published packages with an image." defaultChecked={values.featured} />
        </div>
        <div className="sm:col-span-2">
          <MediaMultiPicker name="galleryIds" label="Gallery photos" media={media} defaultValue={values.galleryIds ?? []} hint="Shown on the package page." />
        </div>
        {services.length > 0 && (
          <div className="sm:col-span-2">
            <CheckboxGroup label="Services included" name="serviceIds" options={services} defaultValue={values.serviceIds ?? []} />
          </div>
        )}
        <TextField label="SEO title" name="seoTitle" defaultValue={values.seoTitle ?? ""} maxLength={70} hint="Empty = “<name> Decoration Package”." />
        <TextArea label="SEO description" name="seoDescription" rows={2} maxLength={170} defaultValue={values.seoDescription ?? ""} hint="Empty = the summary." />
      </div>
    </ActionForm>
  );
}

export function EditPackageButton(props: Omit<FormProps, "onDone"> & { values: PackageValues }) {
  return (
    <DialogButton label="Edit package" icon={Pencil} title="Edit package" dialogSize="lg">
      {(close) => <PackageForm {...props} onDone={close} />}
    </DialogButton>
  );
}

export function NewPackageButton(props: Omit<FormProps, "onDone" | "values">) {
  return (
    <DialogButton label="New package" icon={Plus} variant="primary" title="New package" dialogSize="lg">
      {(close) => <PackageForm {...props} onDone={close} />}
    </DialogButton>
  );
}

export function PackagePublishControls({ id, status, canPublish }: { id: string; status: string; canPublish: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {canPublish &&
        (status === "PUBLISHED" ? (
          <ConfirmButton variant="secondary" confirmVariant="primary" icon={EyeOff} title="Unpublish this package?" body="It's removed from the website and goes back to draft. Quotations that use it are not affected." confirmLabel="Unpublish" success="Unpublished" action={() => setPackageStatus({ id, status: "DRAFT" })}>
            Unpublish
          </ConfirmButton>
        ) : (
          <ConfirmButton variant="primary" confirmVariant="primary" icon={Eye} title="Publish this package?" body="It appears on the website straight away (and on the homepage if it's featured)." confirmLabel="Publish" success="Published" action={() => setPackageStatus({ id, status: "PUBLISHED" })}>
            Publish
          </ConfirmButton>
        ))}
      <ConfirmButton variant="secondary" confirmVariant="primary" icon={Copy} title="Duplicate this package?" body="A copy with the same details and contents is created as a draft." confirmLabel="Duplicate" action={() => duplicatePackage({ id })}>
        Duplicate
      </ConfirmButton>
      {canPublish && status !== "ARCHIVED" && (
        <ConfirmButton icon={Archive} title="Archive this package?" body="It's hidden from the website and no longer offered on new quotations. Existing quotations and bookings keep it." confirmLabel="Archive" success="Archived" action={() => setPackageStatus({ id, status: "ARCHIVED" })}>
          Archive
        </ConfirmButton>
      )}
    </span>
  );
}

export function PackageOrder({ id, first, last }: { id: string; first: boolean; last: boolean }) {
  return (
    <span className="flex">
      <ActionButton size="icon-sm" variant="ghost" icon={ArrowUp} aria-label="Move earlier" disabled={first} action={() => movePackage({ id, direction: "up" })} />
      <ActionButton size="icon-sm" variant="ghost" icon={ArrowDown} aria-label="Move later" disabled={last} action={() => movePackage({ id, direction: "down" })} />
    </span>
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
    <ConfirmButton size="icon-sm" icon={Trash2} title={`Remove “${label}”?`} body="Quotations and bookings that already use this package keep their own copy of its contents." confirmLabel="Remove" success="Removed" action={() => deletePackageItem({ id })}>
      <span className="sr-only">Remove {label}</span>
    </ConfirmButton>
  );
}
