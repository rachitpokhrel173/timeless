"use client";

import { useRouter } from "next/navigation";
import { Ban, BellRing, CheckCircle2, CirclePlay, FileText, Pencil, Trophy, Undo2, Wallet } from "lucide-react";
import { fmtDate, todayISO } from "@/lib/format";
import { ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { createInvoiceAction } from "../invoices/actions";
import { recordPaymentAction, voidPaymentAction } from "../payments/actions";
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

export function PaymentButton({
  bookingId,
  balance,
  invoices,
  hasEmail,
  methods,
  label = "Record payment",
  variant = "primary",
}: {
  bookingId: string;
  balance: number;
  invoices: Option[];
  hasEmail: boolean;
  methods: Option[];
  label?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <DialogButton label={label} icon={Wallet} variant={variant} title="Record a payment" description={`Outstanding: NPR ${balance.toLocaleString("en-IN")}`}>
      {(close) => (
        <ActionForm action={recordPaymentAction} extra={{ bookingId }} submitLabel="Record payment" success={(d) => `Payment ${(d as { number: string }).number} recorded`} onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Amount (NPR)" name="amount" type="number" min={1} max={balance} defaultValue={balance || ""} required autoFocus />
            <TextField label="Date received" name="paidAt" type="date" defaultValue={todayISO()} max={todayISO()} required />
            <SelectField label="Method" name="method" options={methods} defaultValue="BANK_TRANSFER" />
            <TextField label="Reference" name="reference" placeholder="Transaction / cheque no." />
            {invoices.length > 0 && <SelectField label="Invoice" name="invoiceId" options={invoices} placeholder="Open invoice (automatic)" wrapClassName="sm:col-span-2" />}
            <TextArea label="Notes" name="notes" rows={2} wrapClassName="sm:col-span-2" />
            <CheckboxField name="sendReceipt" label="Email a receipt to the client" disabled={!hasEmail} defaultChecked={hasEmail} className="sm:col-span-2" />
          </div>
        </ActionForm>
      )}
    </DialogButton>
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

export function VoidPaymentButton({ id, number }: { id: string; number: string }) {
  return (
    <DialogButton label="Void" variant="danger-ghost" size="sm" title={`Void ${number}?`}>
      {(close) => (
        <ActionForm action={voidPaymentAction} extra={{ id }} submitLabel="Void payment" success="Payment voided" onSuccess={close} onCancel={close}>
          <p className="text-[13px] text-a-muted">The payment stays on record as void and the booking balance goes back up.</p>
          <TextField label="Reason" name="reason" required placeholder="Entered twice, bounced cheque…" />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function InvoiceButton({ bookingId, dueDate }: { bookingId: string; dueDate: string | null }) {
  const router = useRouter();
  return (
    <DialogButton label="Create invoice" icon={FileText} title="Create invoice" description="Itemised from the booked items, with payments already made applied.">
      {(close) => (
        <ActionForm
          action={createInvoiceAction}
          extra={{ bookingId, open: false }}
          submitLabel="Create invoice"
          success="Invoice created"
          onCancel={close}
          onSuccess={(d) => {
            close();
            router.push(`/admin/invoices/${(d as { id: string }).id}`);
          }}
        >
          <TextField label="Due date" name="dueDate" type="date" defaultValue={dueDate ?? ""} />
          <TextArea label="Notes on the invoice" name="notes" rows={2} />
          <CheckboxField name="send" label="Mark as sent now" />
        </ActionForm>
      )}
    </DialogButton>
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
