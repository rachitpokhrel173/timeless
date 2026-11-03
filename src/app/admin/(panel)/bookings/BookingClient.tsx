"use client";

import { Ban, BellRing, CheckCircle2, CirclePlay, Pencil, Trophy, Undo2 } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { ActionForm, CheckboxField, ConfirmButton, DialogButton, TextArea, TextField } from "@/components/admin/interactive";
import { sendPaymentReminderAction, setBookingStatusAction, updateBookingMoney } from "./actions";

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
