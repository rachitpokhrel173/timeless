"use client";

import { Archive, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import MediaPicker, { type MediaOption } from "@/components/admin/MediaPicker";
import { ActionButton, ActionForm, CheckboxField, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { saveTestimonial, setTestimonialStatus } from "./actions";

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
  status?: string;
  position?: number;
};

export function TestimonialButton({ values, media, customers, events }: { values?: Values; media: MediaOption[]; customers: Option[]; events: Option[] }) {
  const editing = !!values?.id;
  return (
    <DialogButton label={editing ? <span className="sr-only">Edit</span> : "Add testimonial"} icon={editing ? Pencil : Plus} size={editing ? "icon-sm" : "md"} variant={editing ? "ghost" : "primary"} title={editing ? "Edit testimonial" : "New testimonial"} dialogSize="lg">
      {(close) => (
        <ActionForm action={saveTestimonial} extra={{ id: values?.id ?? null }} success="Saved" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Client name" name="customerName" required defaultValue={values?.customerName} placeholder="Priya & Anil" />
            <TextField label="Event" name="eventType" required defaultValue={values?.eventType} placeholder="Wedding reception" />
            <TextArea label="Their words" name="quote" required rows={4} defaultValue={values?.quote} wrapClassName="sm:col-span-2" />
            <SelectField label="Rating" name="rating" placeholder="No rating" defaultValue={values?.rating ? String(values.rating) : ""} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: "★".repeat(n) }))} />
            <TextField label="Date" name="date" type="date" defaultValue={values?.date ?? ""} />
            <SelectField label="Customer record" name="customerId" options={customers} placeholder="—" defaultValue={values?.customerId ?? ""} />
            <SelectField label="Event record" name="eventId" options={events} placeholder="—" defaultValue={values?.eventId ?? ""} />
            <MediaPicker name="photoId" label="Photo" media={media} defaultValue={values?.photoId} />
            <div className="space-y-3">
              <SelectField
                label="Status"
                name="status"
                defaultValue={values?.status ?? "DRAFT"}
                options={[
                  { value: "DRAFT", label: "Draft" },
                  { value: "PUBLISHED", label: "Published" },
                  { value: "ARCHIVED", label: "Archived" },
                ]}
              />
              <TextField label="Order" name="position" type="number" defaultValue={values?.position ?? 0} />
            </div>
            <CheckboxField name="consent" label="The client agreed to have this published" hint="Required before it can appear on the website." defaultChecked={values?.consent} className="sm:col-span-2" />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function TestimonialStatus({ id, status }: { id: string; status: string }) {
  return (
    <span className="flex">
      {status !== "PUBLISHED" ? (
        <ActionButton size="sm" variant="ghost" icon={Eye} action={() => setTestimonialStatus({ id, status: "PUBLISHED" })} success="Published">
          Publish
        </ActionButton>
      ) : (
        <ActionButton size="sm" variant="ghost" icon={EyeOff} action={() => setTestimonialStatus({ id, status: "DRAFT" })} success="Unpublished">
          Unpublish
        </ActionButton>
      )}
      {status !== "ARCHIVED" && <ActionButton size="icon-sm" variant="ghost" icon={Archive} aria-label="Archive" action={() => setTestimonialStatus({ id, status: "ARCHIVED" })} success="Archived" />}
    </span>
  );
}
