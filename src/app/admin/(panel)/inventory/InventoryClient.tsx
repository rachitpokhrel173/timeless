"use client";

import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDownUp, FolderPlus, Pencil } from "lucide-react";
import { ActionButton, ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField, type Option } from "@/components/admin/interactive";
import { addCategory, archiveItem, createItem, stockOp, updateItem } from "./actions";

export type ItemValues = {
  id?: string;
  sku?: string;
  name?: string;
  categoryId?: string | null;
  description?: string | null;
  unit?: string;
  lowStockThreshold?: number;
  consumable?: boolean;
  purchaseCost?: number;
  replacementCost?: number;
  rentalPrice?: number;
  supplierId?: string | null;
  location?: string | null;
};

export function ItemForm({ values = {}, categories, vendors, onDone }: { values?: ItemValues; categories: Option[]; vendors: Option[]; onDone?: () => void }) {
  const router = useRouter();
  const editing = !!values.id;
  return (
    <ActionForm
      action={editing ? updateItem : createItem}
      extra={editing ? { id: values.id } : undefined}
      submitLabel={editing ? "Save item" : "Add item"}
      success={editing ? "Item saved" : "Item added"}
      onCancel={onDone ?? (() => router.back())}
      onSuccess={(d) => {
        if (onDone) onDone();
        else if (d && typeof d === "object" && "id" in d) router.push(`/admin/inventory/${(d as { id: string }).id}`);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" required defaultValue={values.name} placeholder="Gold Tiffany chair" />
        <TextField label="SKU" name="sku" required defaultValue={values.sku} placeholder="CHR-TIF-GLD" hint="Your own short code." />
        <SelectField label="Category" name="categoryId" options={categories} placeholder="Uncategorised" defaultValue={values.categoryId ?? ""} />
        <TextField label="Unit" name="unit" defaultValue={values.unit ?? "pcs"} placeholder="pcs, sets, metres" />
        {!editing && <TextField label="Opening quantity" name="quantity" type="number" min={0} defaultValue={0} />}
        <TextField label="Low-stock alert below" name="lowStockThreshold" type="number" min={0} defaultValue={values.lowStockThreshold ?? 0} hint="0 = no alert" />
        <TextField label="Rental price (NPR)" name="rentalPrice" type="number" min={0} defaultValue={values.rentalPrice ?? 0} hint="Used when added to a quotation." />
        <TextField label="Purchase cost (NPR)" name="purchaseCost" type="number" min={0} defaultValue={values.purchaseCost ?? 0} />
        <TextField label="Replacement cost (NPR)" name="replacementCost" type="number" min={0} defaultValue={values.replacementCost ?? 0} hint="Charged to event profit when damaged or lost." />
        <SelectField label="Supplier" name="supplierId" options={vendors} placeholder="—" defaultValue={values.supplierId ?? ""} />
        <TextField label="Storage location" name="location" defaultValue={values.location ?? ""} placeholder="Godown A, shelf 3" />
        <CheckboxField name="consumable" label="Consumable" hint="Used up at events (fresh flowers, candles) instead of returned." defaultChecked={values.consumable} className="self-end" />
        <TextArea label="Description" name="description" rows={2} defaultValue={values.description ?? ""} wrapClassName="sm:col-span-2" />
      </div>
    </ActionForm>
  );
}

export function EditItemButton(props: { values: ItemValues; categories: Option[]; vendors: Option[] }) {
  return (
    <DialogButton label="Edit" icon={Pencil} title="Edit item" dialogSize="lg">
      {(close) => <ItemForm {...props} onDone={close} />}
    </DialogButton>
  );
}

const OPS: (Option & { hint: string })[] = [
  { value: "STOCK_IN", label: "Stock in — bought / received", hint: "Adds units you now own." },
  { value: "STOCK_OUT", label: "Stock out — sold / disposed", hint: "Removes usable units permanently." },
  { value: "DAMAGE", label: "Mark damaged", hint: "Sets units aside until repaired." },
  { value: "REPAIRED", label: "Repaired", hint: "Damaged units become usable again." },
  { value: "MAINTENANCE_IN", label: "Send to maintenance", hint: "Out for cleaning or repair." },
  { value: "MAINTENANCE_OUT", label: "Back from maintenance", hint: "" },
  { value: "LOSS", label: "Lost", hint: "Removes units that went missing." },
  { value: "ADJUSTMENT", label: "Stock count — set total", hint: "Enter the counted total owned." },
];

export function StockButton({ id, unit, defaultOp = "STOCK_IN" }: { id: string; unit: string; defaultOp?: string }) {
  return (
    <DialogButton label="Adjust stock" icon={ArrowDownUp} variant="primary" title="Adjust stock" description="Every change is logged with your name.">
      {(close) => (
        <ActionForm action={stockOp} extra={{ id }} submitLabel="Save" success="Stock updated" onSuccess={close} onCancel={close}>
          <SelectField label="What happened" name="op" options={OPS} defaultValue={defaultOp} hint="Damage and maintenance set units aside; a stock count sets the total you own." />
          <TextField label={`Quantity (${unit})`} name="quantity" type="number" min={0} required autoFocus />
          <TextField label="Reference" name="reference" placeholder="Bill no., supplier…" />
          <TextArea label="Notes" name="notes" rows={2} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ArchiveItemButton({ id, archived }: { id: string; archived: boolean }) {
  return archived ? (
    <ActionButton icon={ArchiveRestore} action={() => archiveItem({ id, archived: false })} success="Restored">
      Restore
    </ActionButton>
  ) : (
    <ConfirmButton icon={Archive} variant="ghost" confirmVariant="primary" title="Archive this item?" body="It disappears from pickers and stock lists; history is kept." confirmLabel="Archive" success="Archived" action={() => archiveItem({ id, archived: true })}>
      Archive
    </ConfirmButton>
  );
}

export function CategoryButton() {
  return (
    <DialogButton label="Add category" icon={FolderPlus} title="New inventory category">
      {(close) => (
        <ActionForm action={addCategory} submitLabel="Add" success="Category added" onSuccess={close} onCancel={close}>
          <TextField label="Name" name="name" required placeholder="Lighting" />
        </ActionForm>
      )}
    </DialogButton>
  );
}
