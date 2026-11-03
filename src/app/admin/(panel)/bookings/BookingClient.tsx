"use client";

import { useState } from "react";
import { Ban, BellRing, CheckCircle2, CirclePlay, Pencil, Plus, Trash2, Trophy, Undo2 } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField } from "@/components/admin/interactive";
import { addBookingItem, removeBookingItem, sendPaymentReminderAction, setBookingStatusAction, updateBookingMoney } from "./actions";

const FLOW: Record<string, { to: string; label: string; icon: typeof CheckCircle2; primary?: boolean }[]> = {
  PENDING: [{ to: "CONFIRMED", label: "Confirm booking", icon: CheckCircle2, primary: true }],
  CONFIRMED: [
    { to: "IN_PROGRESS", label: "Start event (load out)", icon: CirclePlay, primary: true },
    { to: "COMPLETED", label: "Mark completed", icon: Trophy },
    { to: "PENDING", label: "Back to pending", icon: Undo2 },
  ],
  IN_PROGRESS: [{ to: "COMPLETED", label: "Mark completed", icon: Trophy, primary: true }],
};

export function BookingStatusButtons({ id, status, canUpdate, canCancel, hasEmail }: { id: string; status: string; canUpdate: boolean; canCancel: boolean; hasEmail: boolean }) {
  return (
    <>
      {canUpdate &&
        (FLOW[status] ?? []).map((s) => (
          <DialogButton key={s.to} label={s.label} icon={s.icon} variant={s.primary ? "primary" : "secondary"} title={s.label}>
            {(close) => (
              <ActionForm action={setBookingStatusAction} extra={{ id, status: s.to }} submitLabel={s.label} success="Booking updated" onSuccess={close} onCancel={close}>
                <p className="text-[13px] text-a-muted">
                  {s.to === "IN_PROGRESS" && "Reserved inventory is marked as checked out to the event."}
                  {s.to === "COMPLETED" && "The event is closed and the lead moves to Completed. Record any damaged or lost items on the event's inventory tab."}
                  {s.to === "CONFIRMED" && "The date is locked in and the event moves into planning."}
                  {s.to === "PENDING" && "The booking goes back to awaiting confirmation."}
                </p>
                {s.to === "CONFIRMED" && <CheckboxField name="notify" label="Email the client a booking confirmation" defaultChecked={hasEmail} disabled={!hasEmail} hint={hasEmail ? undefined : "No email on file."} />}
              </ActionForm>
            )}
          </DialogButton>
        ))}
      {canCancel && !["COMPLETED", "CANCELLED"].includes(status) && (
        <DialogButton label="Cancel booking" icon={Ban} variant="danger-ghost" title="Cancel this booking?">
          {(close) => (
            <ActionForm action={setBookingStatusAction} extra={{ id, status: "CANCELLED" }} submitLabel="Cancel booking" success="Booking cancelled" onSuccess={close} onCancel={close}>
              <p className="text-[13px] text-a-muted">Reserved inventory is released and the event is cancelled. Payments stay on record — void or refund them separately.</p>
              <TextArea label="Reason" name="reason" rows={2} required />
            </ActionForm>
          )}
        </DialogButton>
      )}
    </>
  );
}

/** Email the client what they owe next (the advance first, then the balance). */
export function PaymentReminderButton({ id, email, due }: { id: string; email: string | null; due: { stage: "advance" | "balance"; amount: number; dueDate: string | null } }) {
  const what = `${due.stage === "advance" ? "advance" : "balance"} of NPR ${due.amount.toLocaleString("en-IN")}`;
  return (
    <ConfirmButton
      icon={BellRing}
      variant="secondary"
      confirmVariant="primary"
      disabled={!email}
      title="Send a payment reminder?"
      body={email ? `${email} gets an email about the ${what}${due.dueDate ? `, due ${fmtDate(due.dueDate)}` : ""}, with your payment details from Settings → Invoices.` : "This client has no email address."}
      confirmLabel="Send reminder"
      success="Payment reminder emailed"
      action={() => sendPaymentReminderAction({ id })}
    >
      Send reminder
    </ConfirmButton>
  );
}

export function EditMoneyButton({ id, values }: { id: string; values: { totalAmount: number; depositAmount: number; depositDueDate: string | null; balanceDueDate: string | null } }) {
  return (
    <DialogButton label={<span className="sr-only">Edit amounts</span>} icon={Pencil} size="icon-sm" variant="ghost" title="Contract amounts">
      {(close) => (
        <ActionForm action={updateBookingMoney} extra={{ id }} success="Amounts updated" onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Total (NPR)" name="totalAmount" type="number" min={0} defaultValue={values.totalAmount} required />
            <TextField label="Advance (NPR)" name="depositAmount" type="number" min={0} defaultValue={values.depositAmount} required />
            <TextField label="Advance due" name="depositDueDate" type="date" defaultValue={values.depositDueDate ?? ""} />
            <TextField label="Balance due" name="balanceDueDate" type="date" defaultValue={values.balanceDueDate ?? ""} />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

type StockOption = { value: string; label: string; name: string; price: number; unit: string };

/** Add an extra service (backdrop, stage, lights…) the client asked for after booking. */
export function AddServiceButton({ id, stock }: { id: string; stock: StockOption[] }) {
  return (
    <DialogButton label="Add service" icon={Plus} size="sm" variant="secondary" title="Add a service">
      {(close) => <AddServiceForm id={id} stock={stock} close={close} />}
    </DialogButton>
  );
}

function AddServiceForm({ id, stock, close }: { id: string; stock: StockOption[]; close: () => void }) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const amount = Math.round((Number(quantity) || 0) * (Number(unitPrice) || 0));
  const pick = (value: string) => {
    const s = stock.find((x) => x.value === value);
    if (!s) return;
    setDescription(s.name);
    setUnit(s.unit);
    setUnitPrice(String(s.price));
  };
  return (
    <ActionForm action={addBookingItem} extra={{ id }} submitLabel="Add service" success="Service added — booking total updated" onSuccess={close} onCancel={close}>
      {stock.length > 0 && (
        <SelectField label="From catalog" name="_stock" options={stock} placeholder="Custom service" defaultValue="" onChange={(e) => pick(e.target.value)} hint="Optional — fills in the name and rate." />
      )}
      <TextField label="Service" name="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Backdrop stage" required />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Qty" name="quantity" type="number" min={0.01} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        <TextField label="Unit" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs" />
        <TextField label="Rate (NPR)" name="unitPrice" type="number" min={0} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
      </div>
      <TextArea label="Notes" name="details" rows={2} placeholder="Size, colours, placement…" />
      <p className="text-[13px] text-a-muted">
        The booking total goes up by <span className="font-medium text-a-text tabular-nums">NPR {amount.toLocaleString("en-IN")}</span>.
      </p>
    </ActionForm>
  );
}

export function RemoveServiceButton({ id, itemId, description, amount }: { id: string; itemId: string; description: string; amount: number }) {
  return (
    <ConfirmButton
      icon={Trash2}
      size="icon-sm"
      variant="ghost"
      title={`Remove ${description}?`}
      body={`The booking total goes down by NPR ${amount.toLocaleString("en-IN")}.`}
      confirmLabel="Remove"
      success="Service removed"
      action={() => removeBookingItem({ id, itemId })}
    >
      <span className="sr-only">Remove {description}</span>
    </ConfirmButton>
  );
}
