"use client";

import { Ban, Pencil, Send } from "lucide-react";
import { ActionButton, ActionForm, ConfirmButton, DialogButton, TextArea, TextField } from "@/components/admin/interactive";
import { invoiceStatusAction, updateInvoice } from "./actions";

export default function InvoiceActions({ id, status, paid, dueDate, notes }: { id: string; status: string; paid: number; dueDate: string | null; notes: string | null }) {
  if (status === "CANCELLED") return null;
  return (
    <>
      <DialogButton label="Edit" icon={Pencil} title="Invoice details">
        {(close) => (
          <ActionForm action={updateInvoice} extra={{ id }} success="Invoice updated" onSuccess={close} onCancel={close}>
            <TextField label="Due date" name="dueDate" type="date" defaultValue={dueDate ?? ""} />
            <TextArea label="Notes" name="notes" rows={3} defaultValue={notes ?? ""} />
          </ActionForm>
        )}
      </DialogButton>
      {status === "DRAFT" && (
        <ActionButton variant="primary" icon={Send} action={() => invoiceStatusAction({ id, action: "SEND" })} success="Marked as sent">
          Mark as sent
        </ActionButton>
      )}
      {paid === 0 && (
        <ConfirmButton icon={Ban} title="Cancel this invoice?" body="It stays on record as cancelled. You can then issue a new one from the booking." confirmLabel="Cancel invoice" success="Invoice cancelled" action={() => invoiceStatusAction({ id, action: "CANCEL" })}>
          Cancel invoice
        </ConfirmButton>
      )}
    </>
  );
}
