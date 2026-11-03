"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, HandCoins, Loader2, Search, Wallet } from "lucide-react";
import { recordPaymentAction, searchPayables } from "@/app/admin/(panel)/finance/actions";
import { uploadDocument } from "@/app/admin/(panel)/upload-actions";
import { methodOptions } from "@/lib/finance";
import { fmtDate, npr, todayISO } from "@/lib/format";
import type { PayableBooking, PayableCustomer } from "@/server/payables";
import { ActionForm, CheckboxField, DialogButton, Field, inputClass, SelectField, TextArea, TextField, useToast } from "@/components/admin/interactive";
import type { ButtonVariant } from "@/components/admin/ui";

type Props = {
  /** Preloaded customer (opened from a customer, booking, event or invoice page). Omit to search. */
  customer?: PayableCustomer | null;
  bookingId?: string | null;
  invoiceId?: string | null;
  type?: "ADVANCE" | "PAYMENT";
  /** payments.adjust: may accept overpayments and keep a payment unassigned */
  canAdjust: boolean;
  /** documents.manage: may attach proof of payment */
  canAttach?: boolean;
  label?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
};

/**
 * Record payment / Record advance — the one payment workflow. Every page that takes money opens
 * this dialog and it always calls the same action (record_payment in the database).
 */
export function RecordPaymentButton({ customer, bookingId, invoiceId, type = "PAYMENT", canAdjust, canAttach, label, variant = "primary", size = "md" }: Props) {
  const advance = type === "ADVANCE";
  return (
    <DialogButton
      label={label ?? (advance ? "Record advance" : "Record payment")}
      icon={advance ? HandCoins : Wallet}
      variant={variant}
      size={size}
      title={advance ? "Record an advance" : "Record a payment"}
      description="Money received from a customer. No invoice is needed — it's linked to the customer and booking, and applied to an invoice when there is one."
      dialogSize="lg"
    >
      {(close) => <PaymentDialog close={close} customer={customer ?? null} bookingId={bookingId ?? null} invoiceId={invoiceId ?? null} type={type} canAdjust={canAdjust} canAttach={!!canAttach} />}
    </DialogButton>
  );
}

function PaymentDialog({ close, customer: initial, ...rest }: { close: () => void; customer: PayableCustomer | null; bookingId: string | null; invoiceId: string | null; type: "ADVANCE" | "PAYMENT"; canAdjust: boolean; canAttach: boolean }) {
  const [customer, setCustomer] = useState<PayableCustomer | null>(initial);
  if (!customer) return <CustomerPicker onPick={setCustomer} onCancel={close} />;
  return <PaymentForm key={customer.id} customer={customer} close={close} onChange={initial ? undefined : () => setCustomer(null)} {...rest} />;
}

function CustomerPicker({ onPick, onCancel }: { onPick: (c: PayableCustomer) => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PayableCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchPayables({ q: q.trim() }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
      if (!live) return;
      setLoading(false);
      if (r.ok) {
        setRows(r.data);
        setError(null);
      } else setError(r.error);
    }, q ? 250 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-a-muted" aria-hidden />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer name, phone, email or booking number" aria-label="Search customers" className={`${inputClass} pl-9`} />
        {loading && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-a-muted" aria-hidden />}
      </div>
      {!q && <p className="text-xs text-a-muted">Showing customers who currently owe money. Search to find anyone else.</p>}
      {error && <p className="rounded-md bg-a-danger-soft px-3 py-2 text-[13px] text-a-danger">{error}</p>}
      <ul className="max-h-80 divide-y divide-a-border overflow-y-auto rounded-lg border border-a-border" aria-busy={loading}>
        {rows?.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-a-muted">{q ? `No customer matches “${q}”.` : "Nobody owes money right now."}</li>}
        {rows?.map((c) => {
          const owed = c.bookings.reduce((s, b) => s + b.outstanding, 0);
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-a-subtle/70">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-a-muted">
                    {[c.phone, `${c.bookings.length} active booking${c.bookings.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {owed > 0 && (
                  <span className="text-right text-xs">
                    <span className="block font-semibold text-a-warning tabular-nums">{npr(owed)}</span>
                    <span className="text-a-muted">owed</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <button type="button" onClick={onCancel} className="text-[13px] text-a-muted hover:text-a-text">
          Cancel
        </button>
      </div>
    </div>
  );
}

function bookingLabel(b: PayableBooking) {
  return `${b.bookingNumber} — ${b.eventTitle ?? "Booking"}${b.eventDate ? ` (${fmtDate(b.eventDate)})` : ""} · ${b.outstanding > 0 ? `${npr(b.outstanding)} owed` : "fully paid"}`;
}

function PaymentForm({
  customer,
  bookingId: initialBooking,
  invoiceId: initialInvoice,
  type,
  canAdjust,
  canAttach,
  close,
  onChange,
}: {
  customer: PayableCustomer;
  bookingId: string | null;
  invoiceId: string | null;
  type: "ADVANCE" | "PAYMENT";
  canAdjust: boolean;
  canAttach: boolean;
  close: () => void;
  onChange?: () => void;
}) {
  const toast = useToast();
  // One key per opened form: a double click or a retried request returns the first payment
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const firstBooking = initialBooking ?? (customer.bookings.length === 1 ? customer.bookings[0]!.bookingId : (customer.bookings.find((b) => b.outstanding > 0)?.bookingId ?? ""));
  const [bookingId, setBookingId] = useState<string>(firstBooking);
  const booking = customer.bookings.find((b) => b.bookingId === bookingId) ?? null;
  const [invoiceId, setInvoiceId] = useState<string>(initialInvoice ?? "");
  const [paymentType, setPaymentType] = useState<"ADVANCE" | "PAYMENT">(type);
  const suggested = useMemo(() => {
    if (!booking) return "";
    if (paymentType === "ADVANCE") return String(Math.max(0, Math.min(booking.depositAmount - booking.received, booking.outstanding)) || booking.outstanding || "");
    const inv = booking.invoices.find((i) => i.id === invoiceId);
    return String(inv ? Math.min(inv.due, booking.outstanding) : booking.outstanding || "");
  }, [booking, paymentType, invoiceId]);
  const [amount, setAmount] = useState<string>(suggested);
  // Re-suggest the amount when the booking, type or invoice changes (adjusting state during render).
  const [lastSuggested, setLastSuggested] = useState(suggested);
  if (lastSuggested !== suggested) {
    setLastSuggested(suggested);
    setAmount(suggested);
  }
  const value = Number(amount) || 0;
  const excess = booking ? Math.max(0, value - booking.outstanding) : 0;
  const fileRef = useRef<HTMLInputElement>(null);

  async function attach(number: string, bId: string | null) {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "RECEIPT");
    form.set("title", `Proof of payment ${number}`);
    form.set("customerId", customer.id);
    if (bId) form.set("bookingId", bId);
    const r = await uploadDocument(form).catch(() => ({ ok: false as const, error: "Upload failed." }));
    if (!r.ok) toast("error", `Payment saved, but the attachment didn't upload: ${r.error}`);
  }

  const noBookings = customer.bookings.length === 0;
  return (
    <ActionForm
      action={recordPaymentAction}
      extra={{ customerId: customer.id, bookingId: bookingId || null, invoiceId: booking ? invoiceId || null : null, idempotencyKey, paymentType, allowOverpayment: excess > 0 }}
      submitLabel={paymentType === "ADVANCE" ? "Record advance" : "Record payment"}
      success={(d) => {
        const r = d as { number: string; existed: boolean; balance?: number; autoConfirmed?: boolean; bookingId?: string | null; excess?: number };
        if (r.existed) return `Already recorded as ${r.number}`;
        return `${r.number} recorded${r.autoConfirmed ? " — booking confirmed" : ""}${!r.bookingId ? " — held as customer credit" : (r.excess ?? 0) > 0 ? ` — ${npr(r.excess)} kept as credit` : (r.balance ?? 0) > 0 ? ` · ${npr(r.balance)} still owed` : " · fully paid"}`;
      }}
      onSuccess={(d) => {
        const r = d as { number: string; existed: boolean; bookingId?: string | null };
        if (!r.existed && canAttach) void attach(r.number, r.bookingId ?? null);
        close();
      }}
      onCancel={close}
    >
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-a-border bg-a-subtle/50 p-3 text-[13px]">
        <Check className="mt-0.5 size-4 text-a-success" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{customer.name}</p>
          <p className="text-xs text-a-muted">{[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"}</p>
        </div>
        {onChange && (
          <button type="button" onClick={onChange} className="text-xs font-medium text-a-accent hover:underline">
            Change
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Booking" name="bookingId" className="sm:col-span-2" hint={noBookings ? "This customer has no active booking." : undefined}>
          {(a) => (
            <select
              {...a}
              value={bookingId}
              onChange={(e) => {
                setBookingId(e.target.value);
                setInvoiceId("");
              }}
              className={`${inputClass} pr-8`}
            >
              {(canAdjust || noBookings) && <option value="">{canAdjust ? "No booking yet — keep as customer credit" : "Choose a booking…"}</option>}
              {!canAdjust && !noBookings && !bookingId && <option value="">Choose a booking…</option>}
              {customer.bookings.map((b) => (
                <option key={b.bookingId} value={b.bookingId}>
                  {bookingLabel(b)}
                </option>
              ))}
            </select>
          )}
        </Field>

        {booking && (
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-a-border p-3 text-center text-xs sm:col-span-2">
            <div>
              <p className="text-a-muted">Booking value</p>
              <p className="font-semibold tabular-nums">{npr(booking.totalAmount)}</p>
            </div>
            <div>
              <p className="text-a-muted">Received</p>
              <p className="font-semibold text-a-success tabular-nums">{npr(booking.received)}</p>
            </div>
            <div>
              <p className="text-a-muted">Outstanding</p>
              <p className="font-semibold text-a-warning tabular-nums">{npr(booking.outstanding)}</p>
            </div>
          </div>
        )}

        {booking && booking.invoices.length > 0 && (
          <Field
            label="Invoice"
            name="invoiceId"
            className="sm:col-span-2"
            hint={booking.invoices.length > 1 ? "This booking has more than one open invoice — choose the one this pays." : "Leave on automatic to apply it to the booking's open invoice."}
          >
            {(a) => (
              <select {...a} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className={`${inputClass} pr-8`}>
                <option value="">{booking.invoices.length > 1 ? "Not yet — keep on the booking" : "Automatic"}</option>
                {booking.invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number} · {npr(i.due)} due{i.status === "DRAFT" ? " (draft)" : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {booking && booking.invoices.length === 0 && <p className="text-xs text-a-muted sm:col-span-2">No invoice yet — that&apos;s fine. The payment stays on the booking and is applied automatically when you create the invoice.</p>}

        <Field label="Type" name="paymentType">
          {(a) => (
            <select {...a} value={paymentType} onChange={(e) => setPaymentType(e.target.value as "ADVANCE" | "PAYMENT")} className={`${inputClass} pr-8`}>
              <option value="ADVANCE">Advance</option>
              <option value="PAYMENT">Payment / instalment</option>
            </select>
          )}
        </Field>
        <TextField label="Amount (NPR)" name="amount" type="number" inputMode="numeric" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        <TextField label="Date received" name="paidAt" type="date" defaultValue={todayISO()} max={todayISO()} required />
        <SelectField label="Method" name="method" options={methodOptions()} defaultValue={paymentType === "ADVANCE" ? "QR" : "BANK_TRANSFER"} />
        <TextField label="Transaction / reference no." name="reference" placeholder="Bank txn, QR ref, cheque no." />
        <TextField label="Received by" name="receivedBy" placeholder="Who took the money" />
        <TextArea label="Notes" name="notes" rows={2} wrapClassName="sm:col-span-2" />
        {canAttach && (
          <Field label="Proof of payment (optional)" name="file" className="sm:col-span-2" hint="Screenshot or photo of the transfer slip — saved privately to the customer's documents.">
            {(a) => <input {...a} ref={fileRef} type="file" accept="image/*,application/pdf" className="text-[13px]" />}
          </Field>
        )}
        <CheckboxField
          name="sendReceipt"
          label={customer.email ? `Email a receipt to ${customer.email}` : "Email a receipt"}
          hint={customer.email ? undefined : "No email on file for this customer."}
          disabled={!customer.email}
          defaultChecked={!!customer.email}
          className="sm:col-span-2"
        />
      </div>

      {booking && excess > 0 && (
        <div role="alert" className="flex gap-2 rounded-lg border border-a-warning/40 bg-a-warning-soft p-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-a-warning" aria-hidden />
          <div>
            <p className="font-medium">
              {npr(excess)} more than {booking.bookingNumber} still owes ({npr(booking.outstanding)}).
            </p>
            <p className="text-xs text-a-muted">
              {canAdjust
                ? "The full amount is recorded as received; the extra is kept as customer credit. The booking value doesn't change. Submitting confirms this."
                : "Only a finance manager can accept an overpayment. Enter the amount owed, or ask them to record it."}
            </p>
          </div>
        </div>
      )}
      {!booking && !noBookings && canAdjust && (
        <p className="rounded-lg bg-a-subtle p-3 text-xs text-a-muted">Recorded against {customer.name} as unassigned credit. Assign it to a booking from the payment page when you know which one it&apos;s for.</p>
      )}
    </ActionForm>
  );
}
