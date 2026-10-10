"use client";

import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { ActionButton, ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField } from "@/components/admin/interactive";
import { VENDOR_CATEGORIES } from "@/components/admin/status";
import { archiveVendor, saveVendor } from "./actions";


export type VendorValues = {
  id?: string;
  name?: string;
  category?: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  defaultCost?: number;
  rating?: number | null;
  paymentInfo?: string | null;
  notes?: string | null;
  active?: boolean;
};

export function VendorButton({ values }: { values?: VendorValues }) {
  const router = useRouter();
  const editing = !!values?.id;
  return (
    <DialogButton label={editing ? "Edit" : "Add vendor"} icon={editing ? Pencil : Plus} variant={editing ? "secondary" : "primary"} title={editing ? "Edit vendor" : "New vendor"} dialogSize="lg">
      {(close) => (
        <ActionForm
          action={saveVendor}
          extra={{ id: values?.id ?? null }}
          success="Vendor saved"
          onCancel={close}
          onSuccess={(d) => {
            close();
            if (!editing) router.push(`/admin/vendors/${(d as { id: string }).id}`);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Business name" name="name" required defaultValue={values?.name} />
            <SelectField label="Category" name="category" options={VENDOR_CATEGORIES} defaultValue={values?.category ?? "OTHER"} />
            <TextField label="Contact person" name="contactPerson" defaultValue={values?.contactPerson ?? ""} />
            <TextField label="Phone" name="phone" type="tel" defaultValue={values?.phone ?? ""} />
            <TextField label="Email" name="email" type="email" defaultValue={values?.email ?? ""} />
            <TextField label="Typical cost (NPR)" name="defaultCost" type="number" min={0} defaultValue={values?.defaultCost ?? 0} />
            <TextField label="Address" name="address" defaultValue={values?.address ?? ""} wrapClassName="sm:col-span-2" />
            <SelectField
              label="Rating"
              name="rating"
              placeholder="Not rated"
              defaultValue={values?.rating ? String(values.rating) : ""}
              options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${"★".repeat(n)}${"☆".repeat(5 - n)}` }))}
            />
            <TextField label="Payment details" name="paymentInfo" defaultValue={values?.paymentInfo ?? ""} placeholder="Bank / eSewa / Khalti" />
            <TextArea label="Notes" name="notes" rows={3} defaultValue={values?.notes ?? ""} wrapClassName="sm:col-span-2" />
            <CheckboxField name="active" label="Active — available to book" defaultChecked={values?.active ?? true} />
          </div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ArchiveVendorButton({ id, archived }: { id: string; archived: boolean }) {
  return archived ? (
    <ActionButton icon={ArchiveRestore} action={() => archiveVendor({ id, archived: false })} success="Restored">
      Restore
    </ActionButton>
  ) : (
    <ConfirmButton icon={Archive} variant="ghost" confirmVariant="primary" title="Archive this vendor?" body="They're hidden from pickers; past bookings and payments are kept." confirmLabel="Archive" success="Archived" action={() => archiveVendor({ id, archived: true })}>
      Archive
    </ConfirmButton>
  );
}
