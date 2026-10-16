"use client";

import { useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { fmtDate, npr, todayISO } from "@/lib/format";
import { ActionForm, CheckboxField, DialogButton, inputClass, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { recordPaymentAction } from "./actions";

export type PayableBooking = {
  id: string;
  number: string;
  customer: string;
  email: string | null;
  title: string;
  eventDate: string | null;
  total: number;
  paid: number;
  due: { stage: "advance" | "balance"; amount: number; dueDate: string | null };
};

/** Record a payment from the Payments page: find the client's booking, see what they owe, enter the amount. */
export function RecordPaymentDialog({ bookings, methods }: { bookings: PayableBooking[]; methods: Option[] }) {
  return (
    <DialogButton label="Record payment" icon={Plus} variant="primary" title="Record a payment" description="Money received from a client — it's added to their booking." dialogSize="lg">
      {(close) => <RecordPaymentForm bookings={bookings} methods={methods} close={close} />}
    </DialogButton>
  );
}

function RecordPaymentForm({ bookings, methods, close }: { bookings: PayableBooking[]; methods: Option[]; close: () => void }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PayableBooking | null>(bookings.length === 1 ? bookings[0]! : null);
  const q = query.trim().toLowerCase();
  const matches = q ? bookings.filter((b) => [b.customer, b.number, b.title, b.email ?? ""].some((s) => s.toLowerCase().includes(q))) : bookings;

  if (!bookings.length) return <p className="text-[13px] text-a-muted">Nothing is outstanding — every active booking is fully paid.</p>;

  if (!picked) {
    return (
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-a-muted" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client, booking number or event"
            aria-label="Search bookings"
            className={`${inputClass} pl-9`}
          />
        </div>
        <ul className="max-h-80 divide-y divide-a-border overflow-y-auto rounded-lg border border-a-border">
          {matches.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-a-muted">No booking with money owed matches “{query}”.</li>}
          {matches.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => setPicked(b)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-a-subtle/70">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {b.customer} <span className="font-normal text-a-muted">— {b.title}</span>
                  </span>
                  <span className="block text-xs text-a-muted">
                    {b.number}
                    {b.eventDate && ` · ${fmtDate(b.eventDate)}`} · paid {npr(b.paid)} of {npr(b.total)}
                  </span>
                </span>
                <span className="text-right text-xs">
                  <span className="block font-semibold text-a-warning tabular-nums">{npr(b.total - b.paid)}</span>
                  <span className="text-a-muted">owed</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button type="button" onClick={close} className="text-[13px] text-a-muted hover:text-a-text">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const balance = picked.total - picked.paid;
  const late = !!picked.due.dueDate && picked.due.dueDate < todayISO();
  return (
    <ActionForm
      key={picked.id}
      action={recordPaymentAction}
      extra={{ bookingId: picked.id }}
      submitLabel="Record payment"
      success={(d) => {
        const r = d as { number: string; balance: number; autoConfirmed: boolean };
        return `Payment ${r.number} recorded${r.autoConfirmed ? " — booking confirmed" : ""}${r.balance > 0 ? ` · ${npr(r.balance)} still owed` : " · fully paid"}`;
      }}
      onSuccess={close}
      onCancel={close}
    >
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-a-border bg-a-subtle/50 p-3 text-[13px]">
        <Check className="mt-0.5 size-4 text-a-success" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {picked.customer} — {picked.title}
          </p>
          <p className="text-xs text-a-muted">
            {picked.number}
            {picked.eventDate && ` · event ${fmtDate(picked.eventDate)}`} · paid {npr(picked.paid)} of {npr(picked.total)}
          </p>
          <p className={`mt-1 text-xs font-medium ${late ? "text-a-danger" : "text-a-text"}`}>
            Next: {picked.due.stage === "advance" ? "advance" : "balance"} of {npr(picked.due.amount)}
            {picked.due.dueDate && (late ? ` — overdue since ${fmtDate(picked.due.dueDate)}` : ` — due ${fmtDate(picked.due.dueDate)}`)}
          </p>
        </div>
        {bookings.length > 1 && (
          <button type="button" onClick={() => setPicked(null)} className="text-xs font-medium text-a-accent hover:underline">
            Change
          </button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Amount (NPR)" name="amount" type="number" min={1} max={balance} defaultValue={picked.due.amount} hint={`Up to ${npr(balance)}`} required autoFocus />
        <TextField label="Date received" name="paidAt" type="date" defaultValue={todayISO()} max={todayISO()} required />
        <SelectField label="Method" name="method" options={methods} defaultValue="CASH" />
        <TextField label="Reference" name="reference" placeholder="eSewa / bank txn / cheque no." />
        <TextArea label="Notes" name="notes" rows={2} wrapClassName="sm:col-span-2" />
        <CheckboxField
          name="sendReceipt"
          label={picked.email ? `Email a receipt to ${picked.email}` : "Email a receipt"}
          hint={picked.email ? undefined : "No email on file for this client."}
          disabled={!picked.email}
          defaultChecked={!!picked.email}
          className="sm:col-span-2"
        />
      </div>
    </ActionForm>
  );
}
