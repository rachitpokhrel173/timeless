"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ActionButton, ActionForm, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { createInquiryAction, createInquiryFromLead, linkInquiryCustomer, updateInquiry } from "./actions";

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

/**
 * Inquiry → customer. When the phone or email matched someone with a different name, staff
 * decide: the same person (link) or a different one (new customer). Runs in one transaction.
 */
export function InquiryCustomerActions({ id, candidate, customers, canCreate }: { id: string; candidate: { id: string; name: string; phone: string | null; email: string | null } | null; customers: Option[]; canCreate: boolean }) {
  return (
    <div className="space-y-3">
      {candidate && (
        <div className="rounded-md bg-a-warning-soft p-3 text-[13px]">
          <p className="font-medium">Possible existing customer: {candidate.name}</p>
          <p className="text-a-muted">{[candidate.phone, candidate.email].filter(Boolean).join(" · ")} — same phone or email, different name.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ActionButton size="sm" variant="primary" action={() => linkInquiryCustomer({ id, customerId: candidate.id })} success={`Linked to ${candidate.name}`}>
              Same person — link
            </ActionButton>
            {canCreate && (
              <ActionButton size="sm" action={() => linkInquiryCustomer({ id, customerId: null })} success="New customer created">
                Different person — new customer
              </ActionButton>
            )}
          </div>
        </div>
      )}
      {!candidate && canCreate && (
        <ActionButton size="sm" variant="primary" action={() => linkInquiryCustomer({ id, customerId: null })} success="Customer created">
          Create customer from inquiry
        </ActionButton>
      )}
      <ActionForm action={linkInquiryCustomer} extra={{ id }} submitLabel="Link" success="Linked to the customer">
        <SelectField label="Or link an existing customer" name="customerId" options={customers} placeholder="Choose a customer…" required />
      </ActionForm>
    </div>
  );
}

/** Record a new inquiry on an existing lead (a call or walk-in). */
export function LeadInquiryForm({ leadId, eventTypes, defaults, onDone }: { leadId: string; eventTypes: Option[]; defaults: { eventType: string | null; eventDate: string | null; venue: string | null; guestCount: string | null; budget: string | null }; onDone?: () => void }) {
  const router = useRouter();
  return (
    <ActionForm
      action={createInquiryFromLead}
      extra={{ leadId }}
      submitLabel="Create inquiry"
      success={(r: { id: string; number: string; existed: boolean }) => (r.existed ? `Inquiry ${r.number} already created` : `Inquiry ${r.number} created`)}
      onSuccess={(r: { id: string; number: string; existed: boolean }) => {
        onDone?.();
        router.push(`/admin/inquiries/${r.id}`);
      }}
      onCancel={onDone}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Event type" name="eventType" options={eventTypes} required defaultValue={defaults.eventType ?? ""} />
        <TextField label="Event date" name="eventDate" type="date" defaultValue={defaults.eventDate ?? ""} />
        <TextField label="Venue" name="venue" defaultValue={defaults.venue ?? ""} />
        <TextField label="Guests" name="guestCount" defaultValue={defaults.guestCount ?? ""} />
        <TextField label="Budget" name="budget" defaultValue={defaults.budget ?? ""} />
        <TextArea label="What they asked for" name="message" rows={4} wrapClassName="sm:col-span-2" hint="Defaults to the lead's requirements." />
      </div>
    </ActionForm>
  );
}

export function LeadInquiryButton(props: Omit<Parameters<typeof LeadInquiryForm>[0], "onDone">) {
  return (
    <DialogButton label="Create inquiry" icon={Plus} size="sm" title="New inquiry from this lead" dialogSize="lg">
      {(close) => <LeadInquiryForm {...props} onDone={close} />}
    </DialogButton>
  );
}
