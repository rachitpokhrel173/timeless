"use client";

import { ArrowLeft, ArrowRight, Pencil, Plus, Star, Trash2 } from "lucide-react";
import MediaPicker, { type MediaOption } from "@/components/admin/MediaPicker";
import { ActionButton, ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { createAlbum, moveGalleryItem, removeGalleryItem, saveGalleryItem, setAlbumCover, updateAlbum } from "./actions";

const CATEGORIES: Option[] = [
  { value: "weddings", label: "Wedding & Reception" },
  { value: "engagements", label: "Engagement" },
  { value: "pasni", label: "Rice Weaning & Gunyo Cholo" },
  { value: "birthdays", label: "Birthday" },
  { value: "corporate", label: "Corporate & others" },
];

export type AlbumValues = {
  id?: string;
  title?: string;
  slug?: string;
  category?: string;
  eventType?: string | null;
  description?: string | null;
  location?: string | null;
  eventDate?: string | null;
  tags?: string[];
  coverId?: string | null;
  eventId?: string | null;
  featured?: boolean;
  status?: string;
  position?: number;
};

export function AlbumForm({ values = {}, media, eventTypes, events, onDone }: { values?: AlbumValues; media: MediaOption[]; eventTypes: Option[]; events: Option[]; onDone?: () => void }) {
  const editing = !!values.id;
  return (
    <ActionForm action={editing ? updateAlbum : createAlbum} extra={editing ? { id: values.id } : undefined} submitLabel={editing ? "Save album" : "Create album"} success={editing ? "Album saved" : "Album created"} onSuccess={onDone} onCancel={onDone}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Title" name="title" required defaultValue={values.title} placeholder="Garden wedding at Godavari" />
        <SelectField label="Category" name="category" options={CATEGORIES} defaultValue={values.category ?? "weddings"} />
        <TextField label="Location" name="location" defaultValue={values.location ?? ""} />
        <TextField label="Event date" name="eventDate" type="date" defaultValue={values.eventDate ?? ""} />
        <SelectField label="Event type" name="eventType" options={eventTypes} placeholder="—" defaultValue={values.eventType ?? ""} />
        <SelectField label="Linked event" name="eventId" options={events} placeholder="—" defaultValue={values.eventId ?? ""} />
        <TextArea label="Story" name="description" rows={3} defaultValue={values.description ?? ""} wrapClassName="sm:col-span-2" />
        <TextField label="Tags" name="tags" defaultValue={values.tags?.join(", ") ?? ""} hint="Comma-separated: mandap, florals, pastel" wrapClassName="sm:col-span-2" />
        <MediaPicker name="coverId" label="Cover photo" media={media} defaultValue={values.coverId} />
        <div className="space-y-3">
          <SelectField
            label="Status"
            name="status"
            defaultValue={values.status ?? "DRAFT"}
            options={[
              { value: "DRAFT", label: "Draft" },
              { value: "PUBLISHED", label: "Published" },
              { value: "ARCHIVED", label: "Archived" },
            ]}
          />
          <TextField label="Order" name="position" type="number" defaultValue={values.position ?? 0} />
        </div>
        <CheckboxField name="featured" label="Feature on the homepage" defaultChecked={values.featured} />
      </div>
    </ActionForm>
  );
}

export function AlbumButton(props: { values?: AlbumValues; media: MediaOption[]; eventTypes: Option[]; events: Option[] }) {
  const editing = !!props.values?.id;
  return (
    <DialogButton label={editing ? "Edit album" : "New album"} icon={editing ? Pencil : Plus} variant={editing ? "secondary" : "primary"} title={editing ? "Edit album" : "New gallery album"} dialogSize="lg">
      {(close) => <AlbumForm {...props} onDone={close} />}
    </DialogButton>
  );
}

export function PhotoControls({ id, albumId, mediaId, isCover, first, last, values }: { id: string; albumId: string; mediaId: string; isCover: boolean; first: boolean; last: boolean; values: { title: string | null; caption: string | null; featured: boolean; status: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <ActionButton size="icon-sm" variant="ghost" icon={ArrowLeft} aria-label="Move earlier" disabled={first} action={() => moveGalleryItem({ id, direction: "up" })} />
      <ActionButton size="icon-sm" variant="ghost" icon={ArrowRight} aria-label="Move later" disabled={last} action={() => moveGalleryItem({ id, direction: "down" })} />
      <ActionButton size="icon-sm" variant="ghost" icon={Star} aria-label={isCover ? "Album cover" : "Use as cover"} disabled={isCover} action={() => setAlbumCover({ albumId, mediaId })} success="Cover updated" />
      <DialogButton label={<span className="sr-only">Edit photo</span>} icon={Pencil} size="icon-sm" variant="ghost" title="Photo details">
        {(close) => (
          <ActionForm action={saveGalleryItem} extra={{ id }} success="Saved" onSuccess={close} onCancel={close}>
            <TextField label="Title" name="title" defaultValue={values.title ?? ""} />
            <TextArea label="Caption" name="caption" rows={2} defaultValue={values.caption ?? ""} />
            <SelectField
              label="Status"
              name="status"
              defaultValue={values.status}
              options={[
                { value: "PUBLISHED", label: "Published" },
                { value: "DRAFT", label: "Hidden" },
              ]}
            />
            <CheckboxField name="featured" label="Featured photo" defaultChecked={values.featured} />
          </ActionForm>
        )}
      </DialogButton>
      <ConfirmButton size="icon-sm" icon={Trash2} title="Remove from album?" body="The image stays in the media library." confirmLabel="Remove" action={() => removeGalleryItem({ id })}>
        <span className="sr-only">Remove photo</span>
      </ConfirmButton>
    </div>
  );
}
