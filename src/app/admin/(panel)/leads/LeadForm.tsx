"use client";

import { useRouter } from "next/navigation";
import { ActionForm, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { createLeadAction, updateLeadAction } from "./actions";

export type LeadFormValues = {
  id?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  location?: string | null;
  guestCount?: string | null;
  budget?: string | null;
  sourceKey?: string;
  priority?: string;
  assignedTo?: string | null;
  campaignId?: string | null;
};

export type LeadFormOptions = { eventTypes: Option[]; users: Option[]; campaigns: Option[]; sources: Option[]; guestCounts: string[]; budgets: string[] };

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() }));

export default function LeadForm({ values = {}, opts, onDone }: { values?: LeadFormValues; opts: LeadFormOptions; onDone?: () => void }) {
  const router = useRouter();
  const editing = !!values.id;
  return (
    <ActionForm
      action={editing ? updateLeadAction : createLeadAction}
      extra={editing ? { id: values.id } : undefined}
      submitLabel={editing ? "Save changes" : "Create lead"}
      success={editing ? "Lead updated" : "Lead created"}
      onCancel={onDone ?? (() => router.back())}
      onSuccess={(data) => {
        if (onDone) onDone();
        else if (data && typeof data === "object" && "id" in data) router.push(`/admin/leads/${data.id}`);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" defaultValue={values.name} required autoFocus={!editing} wrapClassName="sm:col-span-2" />
        <TextField label="Phone" name="phone" type="tel" defaultValue={values.phone ?? ""} hint="Phone or email is required." />
        <TextField label="Email" name="email" type="email" defaultValue={values.email ?? ""} />
        <SelectField label="Event type" name="eventType" options={opts.eventTypes} placeholder="Not sure yet" defaultValue={values.eventType ?? ""} />
        <TextField label="Event date" name="eventDate" type="date" defaultValue={values.eventDate ?? ""} />
        <TextField label="Location / venue" name="location" defaultValue={values.location ?? ""} wrapClassName="sm:col-span-2" />
        <SelectField label="Guests" name="guestCount" options={opts.guestCounts.map((g) => ({ value: g, label: g }))} placeholder="Unknown" defaultValue={values.guestCount ?? ""} />
        <SelectField label="Budget" name="budget" options={opts.budgets.map((b) => ({ value: b, label: b }))} placeholder="Unknown" defaultValue={values.budget ?? ""} />
        <SelectField label="Source" name="sourceKey" options={opts.sources} defaultValue={values.sourceKey ?? "PHONE"} required />
        <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue={values.priority ?? "MEDIUM"} required />
        <SelectField label="Assigned to" name="assignedTo" options={opts.users} placeholder="Unassigned" defaultValue={values.assignedTo ?? ""} />
        <SelectField label="Campaign" name="campaignId" options={opts.campaigns} placeholder="None" defaultValue={values.campaignId ?? ""} />
        {!editing && <TextArea label="First note" name="notes" rows={3} wrapClassName="sm:col-span-2" placeholder="What did they ask for? Visible to your team only." />}
      </div>
    </ActionForm>
  );
}
