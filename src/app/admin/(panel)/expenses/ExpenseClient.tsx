"use client";

import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { todayISO } from "@/lib/format";
import { ActionButton, ActionForm, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { restoreExpense, saveExpense, updateExpense, voidExpense } from "./actions";

export type ExpenseOptions = {
  categories: Option[];
  vendors: Option[];
  events: Option[];
  bookings: Option[];
  vendorBookings: Option[];
  methods: Option[];
};

export type ExpenseValues = {
  id: string;
  categoryId: string;
  description: string;
  amount: number;
  date: string;
  payee: string | null;
  vendorId: string | null;
  vendorAssignmentId: string | null;
  bookingId: string | null;
  eventId: string | null;
  method: string;
  notes: string | null;
};

function ExpenseFields({ opts, values, defaults }: { opts: ExpenseOptions; values?: ExpenseValues; defaults?: { vendorAssignmentId?: string; amount?: number; description?: string; eventId?: string } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label="Description" name="description" required defaultValue={values?.description ?? defaults?.description} wrapClassName="sm:col-span-2" placeholder="Fresh flowers, fuel, venue electrician…" />
      <TextField label="Amount (NPR)" name="amount" type="number" min={1} required defaultValue={values?.amount ?? defaults?.amount ?? ""} />
      <TextField label="Date" name="date" type="date" required defaultValue={values?.date ?? todayISO()} max={todayISO()} />
      <SelectField label="Category" name="categoryId" options={opts.categories} required placeholder="Choose…" defaultValue={values?.categoryId ?? ""} />
      <SelectField label="Paid by" name="method" options={opts.methods} defaultValue={values?.method ?? "CASH"} />
      <TextField label="Paid to" name="payee" defaultValue={values?.payee ?? ""} placeholder="Shop, person or company" hint="Plain text — no vendor record needed." />
      <SelectField label="Vendor (optional)" name="vendorId" options={opts.vendors} placeholder="—" defaultValue={values?.vendorId ?? ""} />
      {opts.vendorBookings.length > 0 && (
        <SelectField
          label="Pays a vendor booking"
          name="vendorAssignmentId"
          options={opts.vendorBookings}
          placeholder="No — a general expense"
          defaultValue={values?.vendorAssignmentId ?? defaults?.vendorAssignmentId ?? ""}
          hint="Counts towards that vendor's balance."
          wrapClassName="sm:col-span-2"
        />
      )}
      <SelectField label="Booking" name="bookingId" options={opts.bookings} placeholder="General business expense" defaultValue={values?.bookingId ?? ""} hint="Its event is linked automatically." />
      <SelectField label="Event" name="eventId" options={opts.events} placeholder="Not linked to an event" defaultValue={values?.eventId ?? defaults?.eventId ?? ""} hint="Linked expenses count in event profit." />
      <TextArea label="Notes" name="notes" rows={2} wrapClassName="sm:col-span-2" defaultValue={values?.notes ?? ""} />
    </div>
  );
}

export function ExpenseButton({ opts, defaults, label = "Record expense" }: { opts: ExpenseOptions; defaults?: { vendorAssignmentId?: string; amount?: number; description?: string; eventId?: string }; label?: string }) {
  return (
    <DialogButton label={label} icon={Plus} variant="primary" title="Record an expense" dialogSize="lg">
      {(close) => (
        <ActionForm action={saveExpense} success="Expense recorded" onSuccess={close} onCancel={close}>
          <ExpenseFields opts={opts} defaults={defaults} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function EditExpenseButton({ opts, values }: { opts: ExpenseOptions; values: ExpenseValues }) {
  return (
    <DialogButton label="Edit" icon={Pencil} size="icon-sm" variant="ghost" title="Edit expense" description="Every change is recorded in the audit log." dialogSize="lg">
      {(close) => (
        <ActionForm action={updateExpense} extra={{ id: values.id }} success="Expense updated" onSuccess={close} onCancel={close}>
          <ExpenseFields opts={opts} values={values} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function VoidExpenseButton({ id, voided }: { id: string; voided: boolean }) {
  return voided ? (
    <ActionButton size="icon-sm" variant="ghost" icon={RotateCcw} action={() => restoreExpense({ id })} success="Restored" aria-label="Restore expense" />
  ) : (
    <ConfirmButton size="icon-sm" icon={Trash2} title="Void this expense?" body="It stays on record but no longer counts in totals." confirmLabel="Void" success="Voided" action={() => voidExpense({ id })}>
      <span className="sr-only">Void expense</span>
    </ConfirmButton>
  );
}
