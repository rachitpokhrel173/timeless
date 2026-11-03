"use client";

import { Archive, ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import MediaPicker, { MediaMultiPicker, type MediaOption } from "@/components/admin/MediaPicker";
import { ActionButton, ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { deleteServiceItem, moveService, saveService, saveServiceItem, setServiceStatus } from "./actions";

type ServiceValues = {
  id?: string;
  name?: string;
  slug?: string;
  summary?: string;
  description?: string;
  imageId?: string | null;
  galleryIds?: string[];
  category?: string | null;
  startingPrice?: number | null;
  eventType?: string | null;
  featured?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  publishedAt?: Date | string | null;
};

export const SERVICE_CATEGORIES = ["Wedding Decoration", "Engagement Decoration", "Birthday & Celebration Decoration", "Corporate Events", "Special Events", "Custom Decoration"];

export function ServiceButton({ values, media, eventTypes }: { values?: ServiceValues; media: MediaOption[]; eventTypes: Option[] }) {
  const editing = !!values?.id;
  const locked = !!values?.publishedAt;
  return (
    <DialogButton label={editing ? "Edit" : "Add service"} icon={editing ? Pencil : Plus} size={editing ? "sm" : "md"} variant={editing ? "secondary" : "primary"} title={editing ? `Edit ${values?.name}` : "New service"} dialogSize="lg">
      {(close) => (
        <ActionForm action={saveService} extra={{ id: values?.id ?? null }} success={editing ? "Service saved" : "Service created as a draft — preview it, then publish"} onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Name" name="name" required defaultValue={values?.name} placeholder="Wedding Decoration" />
            <TextField
              label="URL name"
              name="slug"
              defaultValue={values?.slug}
              readOnly={locked}
              hint={locked ? `Locked: the page lives at /services/${values?.slug}.` : "Used in /services/… — set once; it's locked after the first publish."}
            />
            <TextField label="Short description" name="summary" required defaultValue={values?.summary} wrapClassName="sm:col-span-2" hint="One line for cards and search results." />
            <TextArea label="Full description" name="description" required rows={6} defaultValue={values?.description} wrapClassName="sm:col-span-2" />
            <MediaPicker name="imageId" label="Cover image" media={media} defaultValue={values?.imageId} />
            <div className="space-y-3">
              <SelectField
                label="Category"
                name="category"
                placeholder="—"
                defaultValue={values?.category ?? ""}
                options={[...new Set([...SERVICE_CATEGORIES, ...(values?.category ? [values.category] : [])])].map((c) => ({ value: c, label: c }))}
              />
              <TextField label="Starting price (NPR)" name="startingPrice" type="number" min={0} defaultValue={values?.startingPrice ?? ""} hint="Optional. Shown as “From NPR …” on the service page." />
              <SelectField label="Event type" name="eventType" options={eventTypes} placeholder="—" defaultValue={values?.eventType ?? ""} hint="Pre-selects it on the inquiry form." />
            </div>
            <div className="sm:col-span-2">
              <MediaMultiPicker name="galleryIds" label="More photos" media={media} defaultValue={values?.galleryIds ?? []} hint="Shown below the description on the service page." />
            </div>
            <TextField label="SEO title" name="seoTitle" defaultValue={values?.seoTitle ?? ""} maxLength={70} hint="Empty = the service name." />
            <TextArea label="SEO description" name="seoDescription" rows={2} maxLength={170} defaultValue={values?.seoDescription ?? ""} hint="Empty = the short description." />
            <CheckboxField name="featured" label="Featured" defaultChecked={values?.featured} />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ServiceStatusControls({ id, status, first, last }: { id: string; status: string; first: boolean; last: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-0.5">
      <ActionButton size="icon-sm" variant="ghost" icon={ArrowUp} aria-label="Move up" disabled={first} action={() => moveService({ id, direction: "up" })} />
      <ActionButton size="icon-sm" variant="ghost" icon={ArrowDown} aria-label="Move down" disabled={last} action={() => moveService({ id, direction: "down" })} />
      {status === "PUBLISHED" ? (
        <ConfirmButton size="sm" variant="ghost" confirmVariant="primary" icon={EyeOff} title="Unpublish this service?" body="It disappears from the website (its page shows “not found”) and goes back to draft." confirmLabel="Unpublish" success="Unpublished" action={() => setServiceStatus({ id, status: "DRAFT" })}>
          Unpublish
        </ConfirmButton>
      ) : (
        <ConfirmButton size="sm" variant="ghost" confirmVariant="primary" icon={Eye} title="Publish this service?" body="It appears on the Services page and gets its own page straight away." confirmLabel="Publish" success="Published — it's on the website" action={() => setServiceStatus({ id, status: "PUBLISHED" })}>
          Publish
        </ConfirmButton>
      )}
      {status !== "ARCHIVED" && (
        <ConfirmButton size="icon-sm" icon={Archive} title="Archive this service?" body="It's hidden from the website and kept here for reference. You can publish it again later." confirmLabel="Archive" success="Archived" action={() => setServiceStatus({ id, status: "ARCHIVED" })}>
          <span className="sr-only">Archive</span>
        </ConfirmButton>
      )}
    </span>
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
