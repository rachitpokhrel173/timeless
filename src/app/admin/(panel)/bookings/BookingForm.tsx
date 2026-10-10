"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, SelectField, TextArea, TextField, useToast, type Option } from "@/components/admin/interactive";
import { createBookingAction } from "./actions";

export default function BookingForm({ customers, packages, eventTypes, defaultCustomer }: { customers: Option[]; packages: (Option & { price: number })[]; eventTypes: Option[]; defaultCustomer?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [total, setTotal] = useState<number | "">("");
  return (
    <ActionForm
      action={createBookingAction}
      submitLabel="Create booking"
      success={false}
      onCancel={() => router.back()}
      onSuccess={(d) => {
        const r = d as { id: string; shortages: string | null };
        toast(r.shortages ? "error" : "success", r.shortages ? `Booking created, but: ${r.shortages}` : "Booking created");
        router.push(`/admin/bookings/${r.id}`);
      }}
    >
      <p className="text-[13px] text-a-muted">For work agreed outside a quotation. Accepted quotations become bookings automatically, with their items.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Customer" name="customerId" options={customers} placeholder="Choose a customer" defaultValue={defaultCustomer ?? ""} required />
        <TextField label="Event title" name="title" required placeholder="e.g. Sharma wedding reception" />
        <SelectField label="Event type" name="eventType" options={eventTypes} placeholder="Not set" />
        <TextField label="Event date" name="eventDate" type="date" required />
        <TextField label="Start time" name="startTime" type="time" />
        <TextField label="End time" name="endTime" type="time" />
        <TextField label="Venue" name="venue" />
        <TextField label="Venue address" name="venueAddress" />
        <TextField label="Guests" name="guestCount" type="number" min={0} />
        <SelectField
          label="Package"
          name="packageId"
          options={packages.map((p) => ({ value: p.value, label: `${p.label}${p.price ? ` — NPR ${p.price.toLocaleString("en-IN")}` : ""}` }))}
          placeholder="Custom (no package)"
          hint="A package reserves its inventory for the event date."
          onChange={(e) => {
            const p = packages.find((x) => x.value === e.target.value);
            if (p?.price && total === "") setTotal(p.price);
          }}
        />
        <TextField label="Total (NPR)" name="totalAmount" type="number" min={0} required value={total} onChange={(e) => setTotal(e.target.value === "" ? "" : Number(e.target.value))} />
        <TextField label="Advance (NPR)" name="depositAmount" type="number" min={0} required defaultValue={0} />
        <TextField label="Advance due" name="depositDueDate" type="date" />
        <TextField label="Balance due" name="balanceDueDate" type="date" hint="Defaults to the event date." />
        <SelectField
          label="Status"
          name="status"
          options={[
            { value: "PENDING", label: "Pending — awaiting advance" },
            { value: "CONFIRMED", label: "Confirmed" },
          ]}
        />
        <TextArea label="Requirements" name="requirements" rows={3} wrapClassName="sm:col-span-2" />
      </div>
    </ActionForm>
  );
}
