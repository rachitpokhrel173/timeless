"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, BookmarkPlus, CalendarCheck, Copy, Wallet, ExternalLink, Pencil, Printer, RefreshCw, Send, Share2, Trash2, XCircle } from "lucide-react";
import { ActionButton, ActionForm, Button, CheckboxField, ConfirmButton, Dialog, DialogButton, Menu, SelectField, TextArea, TextField, useRun, useToast, type Option } from "@/components/admin/interactive";
import { npr, todayISO } from "@/lib/format";
import { whatsappLink } from "@/components/admin/contact-links";
import { LinkButton } from "@/components/admin/ui";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { archiveQuote, convertQuote, deleteQuote, duplicateQuote, recordAdvance, resetQuoteLink, saveQuoteAsTemplate, sendQuote, setQuoteOutcome } from "./actions";

type Props = {
  id: string;
  /** Suggested name when saving as a template */
  title: string;
  status: string;
  sent: boolean;
  token: string;
  archived: boolean;
  bookingId: string | null;
  hasEventDate: boolean;
  customerEmail: string | null;
  customerPhone: string | null;
  /** Whether an email provider is connected, so "Email the link" really sends */
  emailReady: boolean;
  /** WhatsApp message; `{link}` is replaced with the client link */
  shareMessage: string;
  /** Required advance from the quotation, and what has been paid on its booking so far */
  advance: { required: number; paid: number };
  methods: Option[];
  can: { update: boolean; create: boolean; approve: boolean; remove: boolean; pay: boolean };
};

export default function QuoteActions({ id, title, status, sent, token, archived, bookingId, hasEventDate, customerEmail, customerPhone, emailReady, shareMessage, advance, methods, can }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { run, pending } = useRun();
  const [confirmBooking, setConfirmBooking] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const editable = ["DRAFT", "SENT", "VIEWED"].includes(status);
  const link = () => `${window.location.origin}/quote/${token}`;

  return (
    <>
      {sent && (
        <Menu
          label="Share"
          icon={Share2}
          variant="secondary"
          size="md"
          heading="Client can view & download — no login needed"
          items={[
            {
              label: "Send on WhatsApp",
              icon: <WhatsAppIcon className="text-emerald-500" />,
              // No phone on file: WhatsApp opens with the message and lets you pick the chat
              onSelect: () => {
                const text = shareMessage.replace("{link}", link());
                window.open(customerPhone ? whatsappLink(customerPhone, text) : `https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
              },
            },
            {
              label: "Copy client link",
              icon: Copy,
              onSelect: async () => {
                try {
                  await navigator.clipboard.writeText(link());
                  toast("success", "Client link copied");
                } catch {
                  toast("error", "Couldn't copy — open the client view and copy its address.");
                }
              },
            },
            { label: "Open client view", icon: ExternalLink, onSelect: () => window.open(`/quote/${token}`, "_blank", "noopener") },
            ...(can.update ? [{ label: "Reset link", icon: RefreshCw, danger: true, onSelect: () => setConfirmReset(true) }] : []),
          ]}
        />
      )}
      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset the client link?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              pending={pending}
              onClick={() =>
                run(() => resetQuoteLink({ id }), { success: "New link created — share it with the client again", onSuccess: () => setConfirmReset(false) })
              }
            >
              Reset link
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-a-muted">The current link stops working straight away, for anyone who has it. You&apos;ll need to send the client the new link.</p>
      </Dialog>
      <LinkButton href={`/admin/print/quotation/${id}`} icon={Printer} target="_blank">
        Print / PDF
      </LinkButton>
      {can.update && editable && (
        <LinkButton href={`/admin/quotations/${id}/edit`} icon={Pencil}>
          Edit
        </LinkButton>
      )}
      {can.create && (
        <ActionButton icon={Copy} action={() => duplicateQuote({ id })}>
          Duplicate
        </ActionButton>
      )}
      {can.create && (
        <DialogButton label="Save as template" icon={BookmarkPlus} title="Save as a quotation template" description="Reuse these line items and prices for future quotations.">
          {(close) => (
            <ActionForm
              action={saveQuoteAsTemplate}
              extra={{ id }}
              submitLabel="Save template"
              success={false}
              onCancel={close}
              onSuccess={(d) => {
                close();
                toast("success", (d as { replaced: boolean }).replaced ? "Template updated" : "Template saved — pick it under “Start from a template” on a new quotation");
              }}
            >
              <TextField label="Template name" name="name" required defaultValue={title.replace(/^.*?—\s*/, "")} placeholder="e.g. Standard wedding package" autoFocus />
              <TextArea label="Description (optional)" name="description" rows={2} placeholder="What it covers, when to use it" />
              <p className="text-xs text-a-muted">The line items, discount, tax, advance and client notes are saved — not the client, dates or venue. Saving with an existing template&apos;s name replaces it.</p>
            </ActionForm>
          )}
        </DialogButton>
      )}
      {can.update && editable && (
        <DialogButton label={sent ? "Re-send" : "Send to client"} icon={Send} variant={sent ? "secondary" : "primary"} title={sent ? "Re-send quotation" : "Send quotation"}>
          {(close) => (
            <ActionForm
              action={sendQuote}
              extra={{ id }}
              submitLabel={sent ? "Re-send" : "Mark as sent"}
              success={false}
              onCancel={close}
              onSuccess={(d) => {
                close();
                const r = d as { emailed: string };
                toast("success", r.emailed === "SENT" ? "Sent — the client has been emailed" : "Marked as sent. Copy the client link and share it on WhatsApp or email.");
              }}
            >
              <p className="text-[13px] text-a-muted">
                The client gets a private link to review, download and accept the quotation. Sending freezes this version{sent ? " and records a new one" : ""}.
              </p>
              <CheckboxField
                name="email"
                label={customerEmail ? `Email the link to ${customerEmail}` : "Email the client"}
                hint={
                  !customerEmail
                    ? "No email on file — share the link yourself after sending."
                    : emailReady
                      ? "They'll get an email with the link. You can also share it on WhatsApp."
                      : "Email isn't connected yet (Settings → System health) — share the link yourself."
                }
                defaultChecked={!!customerEmail}
                disabled={!customerEmail}
              />
            </ActionForm>
          )}
        </DialogButton>
      )}
      {can.pay && advance.paid === 0 && hasEventDate && !["REJECTED", "EXPIRED"].includes(status) && (bookingId || can.approve) && (
        <DialogButton
          label="Record advance"
          icon={Wallet}
          variant="primary"
          title="Record advance payment"
          description={advance.required > 0 ? `Advance to confirm: ${npr(advance.required)}` : "No advance is set on this quotation."}
        >
          {(close) => (
            <ActionForm
              action={recordAdvance}
              extra={{ id }}
              submitLabel="Record advance & book"
              success={false}
              onCancel={close}
              onSuccess={(d) => {
                close();
                const r = d as { bookingId: string; bookingNumber: string; confirmed: boolean; shortages: string | null };
                toast(r.shortages ? "error" : "success", r.shortages ? `Booked ${r.bookingNumber}, but: ${r.shortages}` : `Advance recorded — booking ${r.bookingNumber} ${r.confirmed ? "confirmed" : "created (pending)"}`);
                router.push(`/admin/bookings/${r.bookingId}?tab=payments`);
              }}
            >
              <p className="text-[13px] text-a-muted">
                {bookingId ? "The payment is added to this quotation's booking." : "This turns the quotation into a booking (with its event and inventory reservations) and records the payment against it."}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Advance received (NPR)" name="amount" type="number" min={1} defaultValue={advance.required || ""} required autoFocus />
                <TextField label="Date received" name="paidAt" type="date" defaultValue={todayISO()} max={todayISO()} required />
                <SelectField label="Method" name="method" options={methods} defaultValue="CASH" />
                <TextField label="Reference" name="reference" placeholder="eSewa / bank txn / cheque no." />
                <TextArea label="Notes" name="notes" rows={2} wrapClassName="sm:col-span-2" />
              </div>
              <CheckboxField
                name="confirm"
                label="Confirm the booking now"
                hint={advance.required > 0 ? `Leave unticked to keep it pending until ${npr(advance.required)} in total is paid — it confirms automatically then.` : undefined}
                defaultChecked
              />
            </ActionForm>
          )}
        </DialogButton>
      )}
      {bookingId ? (
        <LinkButton href={`/admin/bookings/${bookingId}`} variant="primary" icon={CalendarCheck}>
          Open booking
        </LinkButton>
      ) : (
        can.approve &&
        !["REJECTED", "EXPIRED"].includes(status) && (
          <DialogButton label="Convert to booking" icon={CalendarCheck} variant={status === "ACCEPTED" ? "primary" : "secondary"} title="Convert to booking">
            {(close) => (
              <div className="space-y-4 text-[13px]">
                {!hasEventDate ? (
                  <p className="text-a-danger">Add the event date to the quotation first.</p>
                ) : (
                  <>
                    <p className="text-a-muted">
                      Creates the booking, its event workspace and inventory reservations from this quotation{status !== "ACCEPTED" ? ", and records it as accepted on the client's behalf" : ""}.
                    </p>
                    <label className="flex items-start gap-2.5">
                      <input type="checkbox" checked={confirmBooking} onChange={(e) => setConfirmBooking(e.target.checked)} className="mt-0.5 size-4 accent-[var(--a-accent)]" />
                      <span>
                        <span className="font-medium">Mark the booking as confirmed</span>
                        <span className="block text-xs text-a-muted">Leave unticked to keep it pending until the advance is paid (it confirms automatically then).</span>
                      </span>
                    </label>
                  </>
                )}
                <div className="flex justify-end gap-2">
                  <Button onClick={close}>Cancel</Button>
                  <Button
                    variant="primary"
                    pending={pending}
                    disabled={!hasEventDate}
                    onClick={() =>
                      run(() => convertQuote({ id, confirm: confirmBooking }), {
                        onSuccess: (d) => {
                          close();
                          toast(d.shortages ? "error" : "success", d.shortages ? `Booking created, but: ${d.shortages}` : d.existed ? "Already booked" : "Booking created");
                          router.push(`/admin/bookings/${d.bookingId}`);
                        },
                      })
                    }
                  >
                    Create booking
                  </Button>
                </div>
              </div>
            )}
          </DialogButton>
        )
      )}
      {can.update && editable && sent && (
        <DialogButton label="Mark declined" icon={XCircle} variant="danger-ghost" title="Client declined">
          {(close) => (
            <ActionForm action={setQuoteOutcome} extra={{ id, status: "REJECTED" }} submitLabel="Mark declined" success="Marked as declined" onSuccess={close} onCancel={close}>
              <TextArea label="Reason (optional)" name="reason" rows={2} placeholder="Budget, chose another decorator, date changed…" />
            </ActionForm>
          )}
        </DialogButton>
      )}
      {can.update &&
        (archived ? (
          <ActionButton icon={ArchiveRestore} action={() => archiveQuote({ id, archived: false })} success="Restored">
            Restore
          </ActionButton>
        ) : (
          !editable && (
            <ConfirmButton icon={Archive} variant="ghost" confirmVariant="primary" title="Archive this quotation?" body="It's hidden from the list but kept with the customer's history." confirmLabel="Archive" success="Archived" action={() => archiveQuote({ id, archived: true })}>
              Archive
            </ConfirmButton>
          )
        ))}
      {can.remove && !sent && (
        <ConfirmButton icon={Trash2} title="Delete this draft?" body="The client never saw it. This can't be undone from the admin." confirmLabel="Delete" action={() => deleteQuote({ id })}>
          Delete
        </ConfirmButton>
      )}
    </>
  );
}
