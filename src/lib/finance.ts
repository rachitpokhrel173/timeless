/*
 * Finance vocabulary shared by server and client code (no database access here).
 * The figures themselves come from the database views in supabase/migrations/00023_phase4_finance.sql
 * through src/server/finance.ts — never recalculate balances in a component.
 */

/** Methods offered when recording money. ONLINE and CHEQUE remain valid for older records. */
export const FORM_METHODS = ["CASH", "BANK_TRANSFER", "QR", "CARD", "OTHER"] as const;
export const ALL_METHODS = ["CASH", "BANK_TRANSFER", "QR", "CARD", "ONLINE", "CHEQUE", "OTHER"] as const;
export type PaymentMethod = (typeof ALL_METHODS)[number];

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  QR: "QR payment",
  CARD: "Card",
  ONLINE: "Online wallet",
  CHEQUE: "Cheque",
  OTHER: "Other",
};
export const methodLabel = (m: string | null | undefined) => (m ? (METHOD_LABEL[m] ?? m) : "—");
export const methodOptions = (methods: readonly string[] = FORM_METHODS) => methods.map((m) => ({ value: m, label: METHOD_LABEL[m] ?? m }));

export const PAYMENT_TYPE_LABEL: Record<string, string> = { ADVANCE: "Advance", PAYMENT: "Payment" };

/** payment_ledger.status */
export const PAYMENT_STATE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  VALID: { label: "Received", tone: "success" },
  PARTIALLY_REFUNDED: { label: "Partly refunded", tone: "warning" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  REVERSED: { label: "Reversed", tone: "danger" },
};

/** payment_ledger.allocation_state */
export const ALLOCATION_STATE: Record<string, { label: string; tone: "success" | "warning" | "info" | "neutral" | "accent" }> = {
  INVOICED: { label: "On invoice", tone: "success" },
  PARTIAL: { label: "Partly on invoice", tone: "accent" },
  BOOKING: { label: "On booking (not invoiced)", tone: "info" },
  UNASSIGNED: { label: "Unassigned (customer credit)", tone: "warning" },
  NONE: { label: "—", tone: "neutral" },
};

/** booking_finance.payment_status */
export const BOOKING_PAY_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" | "accent" }> = {
  UNPAID: { label: "Unpaid", tone: "danger" },
  PARTIALLY_PAID: { label: "Partially paid", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  OVERPAID: { label: "Overpaid (credit)", tone: "accent" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};
