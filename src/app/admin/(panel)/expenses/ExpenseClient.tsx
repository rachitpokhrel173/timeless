"use client";

import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { todayISO } from "@/lib/format";
import { ActionButton, ActionForm, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { restoreExpense, saveExpense, voidExpense } from "./actions";

export function ExpenseButton({
  categories,
  vendors,
  events,
  vendorBookings,
  methods,
  defaults,
  label = "Record expense",
}: {
  categories: Option[];
  vendors: Option[];
  events: Option[];
  vendorBookings: Option[];
  methods: Option[];
  defaults?: { vendorAssignmentId?: string; amount?: number; description?: string };
  label?: string;
}) {
  return (
    <DialogButton label={label} icon={Plus} variant="primary" title="Record an expense" dialogSize="lg">
      {(close) => (
        <ActionForm action={saveExpense} success="Expense recorded" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Description" name="description" required defaultValue={defaults?.description} wrapClassName="sm:col-span-2" placeholder="Fresh flowers, fuel, venue electrician…" />
            <TextField label="Amount (NPR)" name="amount" type="number" min={1} required defaultValue={defaults?.amount ?? ""} />
            <TextField label="Date" name="date" type="date" required defaultValue={todayISO()} max={todayISO()} />
            <SelectField label="Category" name="categoryId" options={categories} required placeholder="Choose…" />
            <SelectField label="Paid by" name="method" options={methods} defaultValue="CASH" />
            {vendorBookings.length > 0 && (
              <SelectField label="Pays a vendor booking" name="vendorAssignmentId" options={vendorBookings} placeholder="No — a general expense" defaultValue={defaults?.vendorAssignmentId ?? ""} hint="Counts towards that vendor's balance." wrapClassName="sm:col-span-2" />
            )}
            <SelectField label="Vendor" name="vendorId" options={vendors} placeholder="—" />
            <SelectField label="Event" name="eventId" options={events} placeholder="Not linked to an event" hint="Linked expenses count in event profit." />
            <TextArea label="Notes" name="notes" rows={2} wrapClassName="sm:col-span-2" />
          </div>
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
