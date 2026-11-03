"use client";

import { useState } from "react";
import { Archive, ArrowLeft, ArrowRight, Eye, EyeOff, ImagePlus, Pencil, Plus, Star, Trash2 } from "lucide-react";
import MediaPicker, { type MediaOption } from "@/components/admin/MediaPicker";
import { ActionButton, ActionForm, Button, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { createAlbum, importEventPhotos, moveGalleryItem, removeGalleryItem, saveGalleryItem, setAlbumCover, setAlbumStatus, updateAlbum } from "./actions";

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
        <TextField label="Order" name="position" type="number" defaultValue={values.position ?? 0} hint={editing ? "Publish or unpublish from the album page." : "New albums start as drafts."} />
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

export function AlbumStatusControls({ id, status }: { id: string; status: string }) {
  return (
    <>
      {status === "PUBLISHED" ? (
        <ConfirmButton variant="secondary" confirmVariant="primary" icon={EyeOff} title="Unpublish this album?" body="It's removed from the Gallery page and the homepage. The photos stay in the album." confirmLabel="Unpublish" success="Unpublished" action={() => setAlbumStatus({ id, status: "DRAFT" })}>
          Unpublish
        </ConfirmButton>
      ) : (
        <ConfirmButton variant="primary" confirmVariant="primary" icon={Eye} title="Publish this album?" body="The album and its shown photos appear on the Gallery page straight away. Hidden photos stay hidden." confirmLabel="Publish" success="Published" action={() => setAlbumStatus({ id, status: "PUBLISHED" })}>
          Publish
        </ConfirmButton>
      )}
      {status !== "ARCHIVED" && (
        <ConfirmButton icon={Archive} title="Archive this album?" body="It's hidden from the website. Nothing is deleted." confirmLabel="Archive" success="Archived" action={() => setAlbumStatus({ id, status: "ARCHIVED" })}>
          Archive
        </ConfirmButton>
      )}
    </>
  );
}

export type EventPhotoOption = { id: string; thumb: string | null; title: string | null; source: "work" | "design"; added: boolean };

/** Pick photos from the linked completed event. They're copied to the website library and added hidden. */
export function ImportEventPhotosButton({ albumId, photos, blocked }: { albumId: string; photos: EventPhotoOption[]; blocked?: string }) {
  return (
    <DialogButton label="Add event photos" icon={ImagePlus} variant="secondary" title="Add photos from the event" dialogSize="lg">
      {(close) => <ImportEventPhotos albumId={albumId} photos={photos} blocked={blocked} onDone={close} />}
    </DialogButton>
  );
}

function ImportEventPhotos({ albumId, photos, blocked, onDone }: { albumId: string; photos: EventPhotoOption[]; blocked?: string; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  if (blocked) return <p className="text-sm text-a-muted">{blocked}</p>;
  const available = photos.filter((p) => !p.added);
  if (!available.length) return <p className="text-sm text-a-muted">{photos.length ? "Every photo from this event is already in the album." : "This event has no photos yet. Team members add them to their tasks when they finish work."}</p>;
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 40 ? [...cur, id] : cur));
  return (
    <div className="space-y-4">
      <p className="text-sm text-a-muted">
        Photos are copied into the website media library — the originals stay private. They&rsquo;re added <strong>hidden</strong>: describe each one and show it when you&rsquo;re happy. Check the client is comfortable with their event being shown.
      </p>
      <ul className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {available.map((p) => {
          const on = picked.includes(p.id);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => toggle(p.id)} aria-pressed={on} className={`relative block aspect-square w-full overflow-hidden rounded-md border-2 ${on ? "border-a-accent" : "border-transparent"}`}>
                {p.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed private thumbnail
                  <img src={p.thumb} alt={p.title ?? ""} loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center bg-a-subtle text-xs text-a-muted">No preview</span>
                )}
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">{p.source === "work" ? "Team photo" : "Design file"}</span>
                {on && <span className="absolute top-1 right-1 rounded-full bg-a-accent px-1.5 text-xs text-white">✓</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-sm text-a-muted">{picked.length} selected</span>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <ActionButton variant="primary" disabled={!picked.length} action={() => importEventPhotos({ albumId, mediaIds: picked })} success="Added to the album (hidden)" onDone={onDone}>
          Add {picked.length || ""} photo{picked.length === 1 ? "" : "s"}
        </ActionButton>
      </div>
    </div>
  );
}

export function PhotoControls({ id, albumId, mediaId, isCover, first, last, values }: { id: string; albumId: string; mediaId: string; isCover: boolean; first: boolean; last: boolean; values: { title: string | null; caption: string | null; alt: string; featured: boolean; status: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <ActionButton size="icon-sm" variant="ghost" icon={ArrowLeft} aria-label="Move earlier" disabled={first} action={() => moveGalleryItem({ id, direction: "up" })} />
      <ActionButton size="icon-sm" variant="ghost" icon={ArrowRight} aria-label="Move later" disabled={last} action={() => moveGalleryItem({ id, direction: "down" })} />
      <ActionButton size="icon-sm" variant="ghost" icon={Star} aria-label={isCover ? "Album cover" : "Use as cover"} disabled={isCover} action={() => setAlbumCover({ albumId, mediaId })} success="Cover updated" />
      <DialogButton label={<span className="sr-only">Edit photo</span>} icon={Pencil} size="icon-sm" variant="ghost" title="Photo details">
        {(close) => (
          <ActionForm action={saveGalleryItem} extra={{ id }} success="Saved" onSuccess={close} onCancel={close}>
            <TextField label="Title" name="title" defaultValue={values.title ?? ""} />
            <TextField label="Description (alt text)" name="alt" defaultValue={values.alt} maxLength={300} placeholder="Rose and gold mandap at a garden wedding" hint="Read by screen readers and Google. Required to show the photo." />
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
