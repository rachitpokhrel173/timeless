"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LayoutTemplate, Package, Plus, Trash2 } from "lucide-react";
import { npr } from "@/lib/format";
import { lineAmount, quoteTotals } from "@/lib/quote-math";
import { ActionForm, Button, inputClass, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { saveQuote } from "./actions";

export type QuoteLine = { description: string; details?: string | null; quantity: number; unit?: string | null; unitPrice: number; inventoryItemId?: string | null };

export type QuoteEditorValues = {
  id?: string;
  customerId?: string | null;
  leadId?: string | null;
  inquiryId?: string | null;
  packageId?: string | null;
  couponCode?: string | null;
  title?: string;
  eventType?: string | null;
  eventDate?: string | null;
  venue?: string | null;
  guestCount?: number | null;
  validUntil?: string | null;
  discountType?: "PERCENT" | "FIXED";
  discountValue?: number;
  taxRate?: number;
  /** Advance to confirm, in NPR. */
  depositAmount?: number;
  notes?: string | null;
  terms?: string | null;
  termsVersion?: string | null;
  items?: QuoteLine[];
};

type PackageOption = Option & { price: number; lines: { label: string; quantity: number; inventoryItemId: string | null }[] };
type StockOption = Option & { price: number; unit: string };
export type TemplateOption = Option & {
  description?: string | null;
  items: QuoteLine[];
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  taxRate: number;
  depositAmount: number;
  notes?: string | null;
};

const blank = (): QuoteLine => ({ description: "", quantity: 1, unit: "", unitPrice: 0 });

export default function QuoteEditor({
  values,
  customers,
  packages,
  stock,
  eventTypes,
  templates = [],
  customerLabel,
}: {
  values: QuoteEditorValues;
  customers: Option[];
  packages: PackageOption[];
  stock: StockOption[];
  eventTypes: Option[];
  templates?: TemplateOption[];
  /** Shown instead of the customer picker when the customer comes from a lead that isn't converted yet. */
  customerLabel?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<QuoteLine[]>(values.items?.length ? values.items : [blank()]);
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">(values.discountType ?? "FIXED");
  const [discountValue, setDiscountValue] = useState(values.discountValue ?? 0);
  const [taxRate, setTaxRate] = useState(values.taxRate ?? 0);
  const [depositAmount, setDepositAmount] = useState(values.depositAmount ?? 0);
  const [packageId, setPackageId] = useState(values.packageId ?? "");
  const [stockPick, setStockPick] = useState("");
  const [templatePick, setTemplatePick] = useState("");
  // Notes is an uncontrolled field: a template remounts it with the template's text
  const [notes, setNotes] = useState({ key: 0, value: values.notes ?? "" });
  const totals = useMemo(() => quoteTotals({ items, discountType, discountValue, taxRate, depositAmount }), [items, discountType, discountValue, taxRate, depositAmount]);
  const editing = !!values.id;

  const update = (i: number, patch: Partial<QuoteLine>) => setItems((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) =>
    setItems((all) => {
      const next = [...all];
      const j = i + d;
      if (j < 0 || j >= next.length) return all;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  function applyPackage() {
    const pkg = packages.find((p) => p.value === packageId);
    if (!pkg) return;
    const lines: QuoteLine[] = [
      { description: `${pkg.label} package`, quantity: 1, unit: "package", unitPrice: pkg.price, details: pkg.lines.map((l) => `${l.quantity} × ${l.label}`).join(", ") || null },
    ];
    setItems((all) => [...all.filter((l) => l.description.trim()), ...lines]);
  }

  /** Add a template's lines (after any lines already filled in) and take over its pricing defaults. */
  function applyTemplate() {
    const t = templates.find((x) => x.value === templatePick);
    if (!t) return;
    setItems((all) => [...all.filter((l) => l.description.trim()), ...t.items.map((l) => ({ ...l }))]);
    setDiscountType(t.discountType);
    setDiscountValue(t.discountValue);
    setTaxRate(t.taxRate);
    setDepositAmount(t.depositAmount);
    if (t.notes) setNotes((n) => ({ key: n.key + 1, value: t.notes! }));
    setTemplatePick("");
  }

  function addStock() {
    const s = stock.find((x) => x.value === stockPick);
    if (!s) return;
    setItems((all) => [...all.filter((l) => l.description.trim()), { description: s.label, quantity: 1, unit: s.unit, unitPrice: s.price, inventoryItemId: s.value }]);
    setStockPick("");
  }

  return (
    <ActionForm
      action={saveQuote}
      extra={{
        id: values.id ?? null,
        leadId: values.leadId ?? null,
        inquiryId: values.inquiryId ?? null,
        termsVersion: values.termsVersion ?? null,
        packageId: packageId || null,
        discountType,
        discountValue,
        taxRate,
        depositAmount,
        items: items.filter((l) => l.description.trim() || l.unitPrice),
      }}
      submitLabel={editing ? "Save quotation" : "Create quotation"}
      success={editing ? "Quotation saved" : "Quotation created"}
      onCancel={() => router.back()}
      onSuccess={(d) => {
        if (d && typeof d === "object" && "id" in d) router.push(`/admin/quotations/${(d as { id: string }).id}`);
      }}
      footerClassName="sticky bottom-0 -mx-4 border-t border-a-border bg-a-surface px-4 py-3"
    >
      <section className="grid gap-4 sm:grid-cols-2">
        {customerLabel ? (
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium">Customer</p>
            <p className="flex h-9 items-center rounded-md border border-a-border bg-a-subtle px-3 text-[14px]">{customerLabel}</p>
            <p className="text-xs text-a-muted">A customer record is created from the lead when you save.</p>
          </div>
        ) : (
          <SelectField label="Customer" name="customerId" options={customers} placeholder="Choose a customer" defaultValue={values.customerId ?? ""} required />
        )}
        <TextField label="Title" name="title" defaultValue={values.title} required placeholder="e.g. Priya & Anil — wedding reception" />
        <SelectField label="Event type" name="eventType" options={eventTypes} placeholder="Not set" defaultValue={values.eventType ?? ""} />
        <TextField label="Event date" name="eventDate" type="date" defaultValue={values.eventDate ?? ""} />
        <TextField label="Venue" name="venue" defaultValue={values.venue ?? ""} />
        <TextField label="Guests" name="guestCount" type="number" min={0} inputMode="numeric" defaultValue={values.guestCount ?? ""} />
        <TextField label="Valid until" name="validUntil" type="date" defaultValue={values.validUntil ?? ""} hint="The client can accept online until this date." />
        <TextField label="Coupon code" name="couponCode" defaultValue={values.couponCode ?? ""} hint="Optional — applied if it gives a bigger discount." />
      </section>

      {templates.length > 0 && (
        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-a-border bg-a-subtle/40 px-3 py-2.5">
          <LayoutTemplate className="size-4 text-a-muted" aria-hidden />
          <span className="mr-auto text-[13px] font-medium">Start from a template</span>
          <select aria-label="Quotation template" value={templatePick} onChange={(e) => setTemplatePick(e.target.value)} className={`${inputClass} w-auto max-w-72`}>
            <option value="">Choose a template…</option>
            {templates.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {npr(quoteTotals(t).total)}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" icon={LayoutTemplate} onClick={applyTemplate} disabled={!templatePick}>
            Use template
          </Button>
        </section>
      )}

      <section className="space-y-3 border-t border-a-border pt-4">
        <div className="flex flex-wrap items-end gap-2">
          <h2 className="mr-auto font-semibold">Line items</h2>
          {packages.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select aria-label="Package" value={packageId} onChange={(e) => setPackageId(e.target.value)} className={`${inputClass} w-auto`}>
                <option value="">No package</option>
                {packages.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} — {npr(p.price)}
                  </option>
                ))}
              </select>
              <Button size="sm" icon={Package} onClick={applyPackage} disabled={!packageId}>
                Add package
              </Button>
            </div>
          )}
          {stock.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select aria-label="Inventory item" value={stockPick} onChange={(e) => setStockPick(e.target.value)} className={`${inputClass} w-auto max-w-56`}>
                <option value="">Add an inventory item…</option>
                {stock.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Button size="sm" icon={Plus} onClick={addStock} disabled={!stockPick}>
                Add
              </Button>
            </div>
          )}
        </div>
        <p className="text-xs text-a-muted">Lines linked to inventory reserve that stock when the quotation becomes a booking. A package also reserves its contents.</p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs tracking-wide text-a-muted uppercase">
                <th className="w-[44%] pb-2 font-semibold">Description</th>
                <th className="w-20 pb-2 font-semibold">Qty</th>
                <th className="w-24 pb-2 font-semibold">Unit</th>
                <th className="w-32 pb-2 font-semibold">Unit price</th>
                <th className="w-28 pb-2 text-right font-semibold">Amount</th>
                <th className="w-24 pb-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="py-1.5 pr-2">
                    <input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => update(i, { description: e.target.value })} className={inputClass} placeholder="e.g. Stage backdrop with florals" />
                    <input aria-label={`Line ${i + 1} details`} value={l.details ?? ""} onChange={(e) => update(i, { details: e.target.value })} className={`${inputClass} mt-1 h-8 text-[13px]`} placeholder="Details (optional)" />
                    {l.inventoryItemId && <span className="mt-1 inline-block text-[11px] text-a-gold">Linked to inventory</span>}
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label={`Line ${i + 1} quantity`} type="number" min={0} step="0.5" value={l.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} className={inputClass} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label={`Line ${i + 1} unit`} value={l.unit ?? ""} onChange={(e) => update(i, { unit: e.target.value })} className={inputClass} placeholder="pcs" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label={`Line ${i + 1} unit price`} type="number" min={0} step={1} value={l.unitPrice} onChange={(e) => update(i, { unitPrice: Math.round(Number(e.target.value)) })} className={inputClass} />
                  </td>
                  <td className="py-1.5 pt-3.5 text-right font-medium tabular-nums">{npr(lineAmount(l))}</td>
                  <td className="py-1.5 pl-2">
                    <div className="flex justify-end">
                      <Button size="icon-sm" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} icon={ArrowUp} />
                      <Button size="icon-sm" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1} icon={ArrowDown} />
                      <Button size="icon-sm" variant="danger-ghost" aria-label="Remove line" onClick={() => setItems((all) => (all.length > 1 ? all.filter((_, j) => j !== i) : [blank()]))} icon={Trash2} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button size="sm" icon={Plus} onClick={() => setItems((all) => [...all, blank()])}>
          Add line
        </Button>
      </section>

      <section className="grid gap-6 border-t border-a-border pt-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <TextArea key={notes.key} label="Notes for the client" name="notes" rows={3} defaultValue={notes.value} />
          <TextArea label="Terms & conditions" name="terms" rows={7} defaultValue={values.terms ?? ""} hint="Defaults come from Settings → Quotations." />
        </div>
        <div className="space-y-3 rounded-lg border border-a-border bg-a-subtle/50 p-4 text-[13px]">
          <Row label="Subtotal" value={npr(totals.subtotal)} />
          <div className="flex items-center gap-2">
            <span className="mr-auto">Discount</span>
            <select aria-label="Discount type" value={discountType} onChange={(e) => setDiscountType(e.target.value as "PERCENT" | "FIXED")} className={`${inputClass} h-8 w-auto`}>
              <option value="FIXED">NPR</option>
              <option value="PERCENT">%</option>
            </select>
            <input aria-label="Discount value" type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} className={`${inputClass} h-8 w-28`} />
          </div>
          {totals.discountAmount > 0 && <Row label="" value={`− ${npr(totals.discountAmount)}`} muted />}
          <div className="flex items-center gap-2">
            <span className="mr-auto">Tax / VAT %</span>
            <input aria-label="Tax rate" type="number" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className={`${inputClass} h-8 w-28`} />
          </div>
          {totals.taxAmount > 0 && <Row label="" value={`+ ${npr(totals.taxAmount)}`} muted />}
          <div className="border-t border-a-border pt-3">
            <Row label="Total" value={npr(totals.total)} strong />
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-auto">Advance to confirm (NPR)</span>
            <input aria-label="Advance amount in NPR" type="number" min={0} step={1} value={depositAmount} onChange={(e) => setDepositAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))} className={`${inputClass} h-8 w-32`} />
          </div>
          {depositAmount > totals.total && <Row label="" value={`More than the total — capped at ${npr(totals.depositAmount)}`} muted />}
          <Row label="Balance" value={npr(totals.balance)} muted />
        </div>
      </section>
    </ActionForm>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? "text-base font-semibold" : ""} ${muted ? "text-a-muted" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
