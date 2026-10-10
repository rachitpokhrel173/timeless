"use client";

import { useRouter } from "next/navigation";
import { ActionForm, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { createInquiryAction, updateInquiry } from "./actions";

const STATUSES: Option[] = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUOTED", label: "Quoted" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function InquiryStatusForm({ id, status, assignedTo, users, disabled }: { id: string; status: string; assignedTo: string | null; users: Option[]; disabled?: boolean }) {
  return (
    <ActionForm action={updateInquiry} extra={{ id }} submitLabel="Update" success="Inquiry updated" hideFooter={disabled}>
      <fieldset disabled={disabled} className="grid gap-3">
        <SelectField label="Status" name="status" options={STATUSES} defaultValue={status} />
        <SelectField label="Assigned to" name="assignedTo" options={users} placeholder="Unassigned" defaultValue={assignedTo ?? ""} />
      </fieldset>
    </ActionForm>
  );
}

export function NewInquiryForm({ eventTypes, sources, users, guestCounts, budgets, me }: { eventTypes: Option[]; sources: Option[]; users: Option[]; guestCounts: string[]; budgets: string[]; me: string }) {
  const router = useRouter();
  return (
    <ActionForm action={createInquiryAction} submitLabel="Save inquiry" success="Inquiry recorded" onCancel={() => router.back()} onSuccess={(d) => d && typeof d === "object" && "id" in d && router.push(`/admin/inquiries/${d.id}`)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" required autoFocus wrapClassName="sm:col-span-2" />
        <TextField label="Phone" name="phone" type="tel" required />
        <TextField label="Email" name="email" type="email" />
        <SelectField label="Event type" name="eventType" options={eventTypes} placeholder="Choose…" required />
        <TextField label="Event date" name="eventDate" type="date" />
        <TextField label="Venue" name="venue" wrapClassName="sm:col-span-2" />
        <SelectField label="Guests" name="guestCount" options={guestCounts.map((g) => ({ value: g, label: g }))} placeholder="Unknown" />
        <SelectField label="Budget" name="budget" options={budgets.map((b) => ({ value: b, label: b }))} placeholder="Unknown" />
        <SelectField label="Source" name="sourceKey" options={sources} defaultValue="PHONE" required />
        <SelectField label="Assigned to" name="assignedTo" options={users} defaultValue={me} />
        <TextArea label="Requirements" name="message" rows={4} wrapClassName="sm:col-span-2" placeholder="Theme, rituals, services needed…" />
      </div>
    </ActionForm>
  );
}
