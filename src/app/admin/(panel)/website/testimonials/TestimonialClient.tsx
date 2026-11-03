"use client";

import { Archive, Check, Eye, EyeOff, Pencil, Plus, RotateCcw, StickyNote, X } from "lucide-react";
import MediaPicker, { type MediaOption } from "@/components/admin/MediaPicker";
import { ActionButton, ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { reviewTestimonial, saveTestimonial, saveTestimonialNotes, setTestimonialStatus } from "./actions";

type Values = {
  id?: string;
  customerName?: string;
  eventType?: string;
  quote?: string;
  rating?: number | null;
  photoId?: string | null;
  date?: string | null;
  customerId?: string | null;
  eventId?: string | null;
  consent?: boolean;
  featured?: boolean;
  status?: string;
  position?: number;
  notes?: string;
};

export function TestimonialButton({ values, media, customers, events }: { values?: Values; media: MediaOption[]; customers: Option[]; events: Option[] }) {
  const editing = !!values?.id;
  const live = values?.status === "PUBLISHED";
  return (
    <DialogButton label={editing ? <span className="sr-only">Edit</span> : "Add testimonial"} icon={editing ? Pencil : Plus} size={editing ? "icon-sm" : "md"} variant={editing ? "ghost" : "primary"} title={editing ? "Edit testimonial" : "New testimonial"} dialogSize="lg">
      {(close) => (
        <ActionForm action={saveTestimonial} extra={{ id: values?.id ?? null }} success={editing ? "Saved" : "Added — review it before publishing"} onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Client name" name="customerName" required defaultValue={values?.customerName} placeholder="Priya & Anil" />
            <TextField label="Event" name="eventType" required defaultValue={values?.eventType} placeholder="Wedding reception" />
            <TextArea
              label="Their words"
              name="quote"
              required
              rows={4}
              defaultValue={values?.quote}
              wrapClassName="sm:col-span-2"
              readOnly={live}
              hint={live ? "Unpublish to change the client's words — they'll need approving again." : "Exactly what the client said. Fix typos only."}
            />
            <SelectField label="Rating" name="rating" placeholder="No rating" defaultValue={values?.rating ? String(values.rating) : ""} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: "★".repeat(n) }))} hint="Only the rating the client actually gave." />
            <TextField label="Date" name="date" type="date" defaultValue={values?.date ?? ""} />
            <SelectField label="Customer record" name="customerId" options={customers} placeholder="—" defaultValue={values?.customerId ?? ""} hint="Internal link — never shown on the website." />
            <SelectField label="Event record" name="eventId" options={events} placeholder="—" defaultValue={values?.eventId ?? ""} />
            <MediaPicker name="photoId" label="Photo" media={media} defaultValue={values?.photoId} />
            <div className="space-y-3">
              <TextField label="Order" name="position" type="number" defaultValue={values?.position ?? 0} />
              <CheckboxField name="featured" label="Featured" hint="Featured testimonials show first on the homepage." defaultChecked={values?.featured} />
            </div>
            <CheckboxField name="consent" label="The client agreed to have this published" hint="Required before it can appear on the website." defaultChecked={values?.consent} className="sm:col-span-2" />
            <TextArea label="Internal notes" name="notes" rows={2} defaultValue={values?.notes ?? ""} wrapClassName="sm:col-span-2" hint="Staff only — how consent was given, follow-ups. Never shown on the website." />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function TestimonialNotesButton({ id, notes }: { id: string; notes: string }) {
  return (
    <DialogButton label={<span className="sr-only">Internal notes</span>} icon={StickyNote} size="icon-sm" variant="ghost" title="Internal notes">
      {(close) => (
        <ActionForm action={saveTestimonialNotes} extra={{ id }} success="Notes saved" onSuccess={close} onCancel={close}>
          <TextArea label="Notes" name="notes" rows={4} defaultValue={notes} hint="Staff only. Never shown on the website." />
        </ActionForm>
      )}
    </DialogButton>
  );
}

/** Review and publishing controls for one testimonial. */
export function TestimonialControls({ id, status, review, consent }: { id: string; status: string; review: string; consent: boolean }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {review !== "APPROVED" && (
        <ActionButton size="sm" variant="ghost" icon={Check} action={() => reviewTestimonial({ id, decision: "APPROVED" })} success="Approved">
          Approve
        </ActionButton>
      )}
      {review !== "REJECTED" && (
        <ConfirmButton size="sm" variant="ghost" icon={X} title="Reject this testimonial?" body={status === "PUBLISHED" ? "It's taken off the website straight away. Nothing is deleted." : "It won't be published. Nothing is deleted."} confirmLabel="Reject" success="Rejected" action={() => reviewTestimonial({ id, decision: "REJECTED" })}>
          Reject
        </ConfirmButton>
      )}
      {review === "REJECTED" && (
        <ActionButton size="sm" variant="ghost" icon={RotateCcw} action={() => reviewTestimonial({ id, decision: "PENDING" })} success="Back to pending">
          Reconsider
        </ActionButton>
      )}
      {status === "PUBLISHED" ? (
        <ActionButton size="sm" variant="ghost" icon={EyeOff} action={() => setTestimonialStatus({ id, status: "DRAFT" })} success="Unpublished">
          Unpublish
        </ActionButton>
      ) : (
        review === "APPROVED" && (
          <ConfirmButton
            size="sm"
            variant="secondary"
            confirmVariant="primary"
            icon={Eye}
            disabled={!consent}
            title="Publish this testimonial?"
            body="It appears on the homepage straight away. The client's name, event and words are shown — never their contact details."
            confirmLabel="Publish"
            success="Published"
            action={() => setTestimonialStatus({ id, status: "PUBLISHED" })}
          >
            {consent ? "Publish" : "Needs consent"}
          </ConfirmButton>
        )
      )}
      {status !== "ARCHIVED" && <ActionButton size="icon-sm" variant="ghost" icon={Archive} aria-label="Archive" action={() => setTestimonialStatus({ id, status: "ARCHIVED" })} success="Archived" />}
    </span>
  );
}
