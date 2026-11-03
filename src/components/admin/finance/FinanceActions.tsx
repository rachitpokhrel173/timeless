"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, FilePlus2, FileText, Link2, Mail, Pencil, RefreshCcw, Send, Undo2, Unlink } from "lucide-react";
import {
  allocatePaymentAction,
  assignBookingAction,
  cancelInvoiceAction,
  createInvoiceAction,
  emailReceiptAction,
  issueInvoiceAction,
  refundPaymentAction,
  releaseAllocationAction,
  reversePaymentAction,
  reviseInvoiceAction,
  updateInvoiceAction,
} from "@/app/admin/(panel)/finance/actions";
import { methodOptions } from "@/lib/finance";
import { npr, todayISO } from "@/lib/format";
import { ActionButton, ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";

/* ───────── Invoices ───────── */

/** Create the booking's invoice. Payments already received (the advance) are applied automatically. */
export function CreateInvoiceButton({ bookingId, dueDate, received, total, variant = "secondary", size = "md" }: { bookingId: string; dueDate: string | null; received: number; total: number; variant?: "primary" | "secondary"; size?: "sm" | "md" }) {
  const router = useRouter();
  return (
    <DialogButton label="Create invoice" icon={FilePlus2} variant={variant} size={size} title="Create invoice" description="Itemised from the booked services.">
      {(close) => (
        <ActionForm
          action={createInvoiceAction}
          extra={{ bookingId }}
          submitLabel="Create invoice"
          success={(d) => {
            const r = d as { number: string; applied: number; due: number };
            return `${r.number} created${r.applied ? ` — ${npr(r.applied)} already received applied, ${npr(r.due)} due` : ""}`;
          }}
          onCancel={close}
          onSuccess={(d) => {
            close();
            router.push(`/admin/invoices/${(d as { id: string }).id}`);
          }}
        >
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-a-border p-3 text-center text-xs">
            <div>
              <p className="text-a-muted">Invoice total</p>
              <p className="font-semibold tabular-nums">{npr(total)}</p>
            </div>
            <div>
              <p className="text-a-muted">Previously received</p>
              <p className="font-semibold text-a-success tabular-nums">{npr(received)}</p>
            </div>
            <div>
              <p className="text-a-muted">New amount due</p>
              <p className="font-semibold text-a-warning tabular-nums">{npr(Math.max(0, total - received))}</p>
            </div>
          </div>
          {received > 0 && <p className="text-xs text-a-muted">Payments already received keep their original dates and references — nothing needs to be recorded again.</p>}
          <TextField label="Due date" name="dueDate" type="date" defaultValue={dueDate ?? ""} />
          <TextArea label="Notes on the invoice" name="notes" rows={2} />
          <CheckboxField name="send" label="Issue it now" hint="Leave unticked to keep it as a draft you can still check." />
        </ActionForm>
      )}
    </DialogButton>
  );
}

/** Create an invoice from the Finance page: choose one of the bookings that has no open invoice. */
export function NewInvoiceButton({ bookings }: { bookings: Option[] }) {
  const router = useRouter();
  return (
    <DialogButton label="Create invoice" icon={FilePlus2} title="Create invoice" description="For a booking without an open invoice. Payments already received for it are applied automatically.">
      {(close) =>
        bookings.length === 0 ? (
          <p className="text-[13px] text-a-muted">Every active booking already has an invoice. To correct one, open it and use Revise.</p>
        ) : (
          <ActionForm
            action={createInvoiceAction}
            submitLabel="Create invoice"
            success={(d) => {
              const r = d as { number: string; applied: number; due: number };
              return `${r.number} created${r.applied ? ` — ${npr(r.applied)} already received applied, ${npr(r.due)} due` : ""}`;
            }}
            onCancel={close}
            onSuccess={(d) => {
              close();
              router.push(`/admin/invoices/${(d as { id: string }).id}`);
            }}
          >
            <SelectField label="Booking" name="bookingId" options={bookings} required placeholder="Choose a booking…" />
            <TextField label="Due date" name="dueDate" type="date" hint="Leave empty to use the booking's balance due date." />
            <TextArea label="Notes on the invoice" name="notes" rows={2} />
            <CheckboxField name="send" label="Issue it now" />
          </ActionForm>
        )
      }
    </DialogButton>
  );
}

export function InvoiceControls({ id, number, status, dueDate, notes }: { id: string; number: string; status: string; dueDate: string | null; notes: string | null }) {
  const router = useRouter();
  if (status === "CANCELLED") return null;
  const issued = status !== "DRAFT";
  return (
    <>
      <DialogButton label="Edit" icon={Pencil} title={`Edit ${number}`} description={issued ? "Amounts of an issued invoice are fixed — use Revise to correct them. Changes here are logged." : undefined}>
        {(close) => (
          <ActionForm action={updateInvoiceAction} extra={{ id }} success="Invoice updated" onSuccess={close} onCancel={close}>
            <TextField label="Due date" name="dueDate" type="date" defaultValue={dueDate ?? ""} />
            <TextArea label="Notes" name="notes" rows={3} defaultValue={notes ?? ""} />
          </ActionForm>
        )}
      </DialogButton>
      {!issued && (
        <ActionButton variant="primary" icon={Send} action={() => issueInvoiceAction({ id })} success="Invoice issued">
          Issue invoice
        </ActionButton>
      )}
      {issued && (
        <DialogButton label="Revise" icon={RefreshCcw} title={`Revise ${number}`} description="Creates a corrected invoice from the booking's current services and value. The original stays on record as cancelled; its payments move to the new invoice.">
          {(close) => (
            <ActionForm
              action={reviseInvoiceAction}
              extra={{ id }}
              submitLabel="Create revised invoice"
              success={(d) => `Revised as ${(d as { number: string }).number}`}
              onCancel={close}
              onSuccess={(d) => {
                close();
                router.push(`/admin/invoices/${(d as { id: string }).id}`);
              }}
            >
              <TextArea label="Reason for the revision" name="reason" rows={2} required placeholder="Price agreed changed, wrong due date…" />
              <TextField label="Due date" name="dueDate" type="date" defaultValue={dueDate ?? ""} />
              <TextArea label="Notes on the new invoice" name="notes" rows={2} defaultValue={notes ?? ""} />
              <CheckboxField name="send" label="Issue the revised invoice now" defaultChecked />
            </ActionForm>
          )}
        </DialogButton>
      )}
      <DialogButton label="Cancel invoice" icon={Ban} variant="danger-ghost" title={`Cancel ${number}?`}>
        {(close) => (
          <ActionForm action={cancelInvoiceAction} extra={{ id }} submitLabel="Cancel invoice" success="Invoice cancelled" onSuccess={close} onCancel={close}>
            <p className="text-[13px] text-a-muted">It stays on record as cancelled. Payments applied to it go back to the booking (nothing is lost) and are applied to the next invoice.</p>
            <TextArea label="Reason" name="reason" rows={2} required />
          </ActionForm>
        )}
      </DialogButton>
    </>
  );
}

/* ───────── Payments ───────── */

export function AllocateButton({ paymentId, unallocated, invoices, size = "sm" }: { paymentId: string; unallocated: number; invoices: { id: string; number: string; due: number }[]; size?: "sm" | "md" }) {
  if (!invoices.length || unallocated <= 0) return null;
  return (
    <DialogButton label="Apply to invoice" icon={Link2} size={size} title="Apply to an invoice" description={`${npr(unallocated)} of this payment isn't on an invoice yet.`}>
      {(close) => (
        <ActionForm action={allocatePaymentAction} extra={{ paymentId }} submitLabel="Apply" success="Payment applied" onSuccess={close} onCancel={close}>
          <SelectField label="Invoice" name="invoiceId" required options={invoices.map((i) => ({ value: i.id, label: `${i.number} · ${npr(i.due)} due` }))} defaultValue={invoices[0]!.id} />
          <TextField label="Amount (NPR)" name="amount" type="number" min={1} max={unallocated} placeholder="As much as possible" hint={`Up to ${npr(unallocated)} (and no more than the invoice has due).`} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ReleaseAllocationButton({ allocationId, label }: { allocationId: string; label: string }) {
  return (
    <DialogButton label={<span className="sr-only">Take off {label}</span>} icon={Unlink} size="icon-sm" variant="ghost" title={`Take this payment off ${label}?`}>
      {(close) => (
        <ActionForm action={releaseAllocationAction} extra={{ allocationId }} submitLabel="Take off invoice" success="Removed from the invoice" onSuccess={close} onCancel={close}>
          <p className="text-[13px] text-a-muted">The money stays received on the booking; only its link to this invoice is reversed (and kept in the history).</p>
          <TextField label="Reason" name="reason" required />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function AssignBookingButton({ paymentId, bookings }: { paymentId: string; bookings: Option[] }) {
  if (!bookings.length) return null;
  return (
    <DialogButton label="Assign to booking" icon={Link2} title="Assign to a booking" description="Moves this customer credit onto one of their bookings.">
      {(close) => (
        <ActionForm action={assignBookingAction} extra={{ paymentId }} submitLabel="Assign" success="Assigned to the booking" onSuccess={close} onCancel={close}>
          <SelectField label="Booking" name="bookingId" options={bookings} required defaultValue={bookings[0]!.value} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ReversePaymentButton({ id, number, size = "md" }: { id: string; number: string; size?: "sm" | "md" }) {
  return (
    <DialogButton label="Reverse" icon={Undo2} variant="danger-ghost" size={size} title={`Reverse ${number}?`}>
      {(close) => (
        <ActionForm action={reversePaymentAction} extra={{ id }} submitLabel="Reverse payment" success={(d) => `Reversed as ${(d as { number: string }).number}`} onSuccess={close} onCancel={close}>
          <p className="text-[13px] text-a-muted">
            For money that never actually arrived — entered twice, bounced transfer or cheque. The payment stays on record as reversed with a reversal number, it&apos;s taken off any invoice, and balances go back up. For money you hand back, use Refund.
          </p>
          <TextField label="Reason" name="reason" required placeholder="Entered twice, bounced cheque…" />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function RefundButton({ id, number, refundable, size = "md" }: { id: string; number: string; refundable: number; size?: "sm" | "md" }) {
  const [key] = useState(() => crypto.randomUUID());
  if (refundable <= 0) return null;
  return (
    <DialogButton label="Refund" icon={Undo2} size={size} title={`Refund from ${number}`} description={`Up to ${npr(refundable)} can be refunded.`}>
      {(close) => (
        <ActionForm action={refundPaymentAction} extra={{ id, idempotencyKey: key }} submitLabel="Record refund" success={(d) => `Refund ${(d as { number: string }).number} recorded`} onSuccess={close} onCancel={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Amount (NPR)" name="amount" type="number" min={1} max={refundable} defaultValue={refundable} required />
            <TextField label="Refunded on" name="refundedOn" type="date" defaultValue={todayISO()} max={todayISO()} required />
            <SelectField label="Method" name="method" options={methodOptions()} defaultValue="BANK_TRANSFER" />
            <TextField label="Reference" name="reference" />
            <TextArea label="Reason" name="reason" rows={2} required wrapClassName="sm:col-span-2" />
          </div>
          <p className="text-xs text-a-muted">The original payment is kept. If the money is applied to an invoice, that invoice&apos;s paid amount is reduced to match.</p>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function EmailReceiptButton({ id, email }: { id: string; email: string | null }) {
  return (
    <ConfirmButton icon={Mail} variant="secondary" confirmVariant="primary" disabled={!email} title="Email this receipt?" body={email ? `A receipt goes to ${email}.` : "This customer has no email address."} confirmLabel="Send" success="Receipt emailed" action={() => emailReceiptAction({ id })}>
      Email receipt
    </ConfirmButton>
  );
}

export function ReceiptLink({ id, disabled }: { id: string; disabled?: boolean }) {
  if (disabled) return null;
  return (
    <a href={`/admin/print/receipt/${id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-a-accent hover:underline">
      <FileText className="size-3.5" aria-hidden /> Receipt
    </a>
  );
}
