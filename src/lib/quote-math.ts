/**
 * Quotation / invoice arithmetic, shared by the editor (live totals), the server (authoritative
 * totals), PDFs and the seed. All money is whole NPR; rounding happens per line and per step.
 *
 * Order: subtotal → discount → tax on the discounted amount → total → advance (a fixed NPR amount,
 * capped at the total).
 */
export type LineInput = { quantity: number; unitPrice: number };
export type QuoteTotalsInput = {
  items: LineInput[];
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  taxRate: number;
  depositAmount: number;
};

export const lineAmount = (l: LineInput) => Math.round((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));

export function quoteTotals({ items, discountType, discountValue, taxRate, depositAmount: deposit }: QuoteTotalsInput) {
  const subtotal = items.reduce((sum, l) => sum + lineAmount(l), 0);
  const rawDiscount = discountType === "PERCENT" ? (subtotal * clamp(discountValue, 0, 100)) / 100 : discountValue;
  const discountAmount = Math.round(clamp(rawDiscount, 0, subtotal));
  const taxable = subtotal - discountAmount;
  const taxAmount = Math.round((taxable * clamp(taxRate, 0, 100)) / 100);
  const total = taxable + taxAmount;
  const depositAmount = Math.round(clamp(deposit, 0, total));
  return { subtotal, discountAmount, taxAmount, total, depositAmount, balance: total - depositAmount };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number(n) || 0));

/** The advance as a share of the total, kept on quotations for reports (0–100, two decimals). */
export const depositShare = (depositAmount: number, total: number) => (total > 0 ? Math.round((depositAmount / total) * 10000) / 100 : 0);

/** Apply a coupon to a subtotal; returns the discount in NPR (0 when not applicable). */
export function couponDiscount(coupon: { type: "PERCENT" | "FIXED"; value: number; minAmount: number }, subtotal: number) {
  if (subtotal < coupon.minAmount) return 0;
  return Math.round(coupon.type === "PERCENT" ? (subtotal * clamp(coupon.value, 0, 100)) / 100 : Math.min(coupon.value, subtotal));
}
