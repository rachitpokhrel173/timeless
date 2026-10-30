"use client";

import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import MediaPicker, { type MediaOption } from "@/components/admin/MediaPicker";
import { ActionForm, Button, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField, useRun, useToast } from "@/components/admin/interactive";
import {
  deleteChecklist,
  runAutomationsNow,
  saveAutomationRule,
  saveBusiness,
  saveChecklist,
  saveExpenseCategory,
  saveInvoiceSettings,
  saveNotificationSettings,
  saveQuotationSettings,
  saveSource,
  saveStageName,
} from "./actions";

type Business = {
  name?: string;
  shortName?: string;
  tagline?: string;
  title?: string;
  description?: string;
  email?: string;
  phones?: { label: string; e164: string }[];
  whatsapp?: string;
  whatsappMessage?: string;
  address?: { street?: string; city?: string; region?: string; postalCode?: string; country?: string };
  areaServed?: string[];
  announcement?: string;
  currency?: string;
  timezone?: string;
  logo?: { mediaId?: string };
  logoOnDark?: { mediaId?: string };
};

export function BusinessForm({ values, media }: { values: Business; media: MediaOption[] }) {
  return (
    <ActionForm action={saveBusiness} success="Business details saved — the website is updated">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Business name" name="name" required defaultValue={values.name} />
        <TextField label="Short name" name="shortName" required defaultValue={values.shortName} hint="Used in emails and small labels." />
        <TextField label="Tagline" name="tagline" defaultValue={values.tagline} />
        <TextField label="Announcement bar" name="announcement" defaultValue={values.announcement} />
        <TextField label="Site title" name="title" required defaultValue={values.title} wrapClassName="sm:col-span-2" />
        <TextArea label="Description" name="description" required rows={2} defaultValue={values.description} wrapClassName="sm:col-span-2" />
        <TextField label="Email" name="email" type="email" defaultValue={values.email} />
        <TextField label="WhatsApp number" name="whatsapp" defaultValue={values.whatsapp} hint="International format without +, e.g. 9779845411029" />
        <TextArea label="Phone numbers" name="phones" rows={2} defaultValue={values.phones?.map((p) => `${p.label} | ${p.e164}`).join("\n")} hint="One per line: display | +977…" />
        <TextArea label="WhatsApp greeting" name="whatsappMessage" rows={2} defaultValue={values.whatsappMessage} />
        <TextField label="Street / area" name="street" defaultValue={values.address?.street} />
        <TextField label="City" name="city" defaultValue={values.address?.city} />
        <TextField label="Province / region" name="region" defaultValue={values.address?.region} />
        <TextField label="Postal code" name="postalCode" defaultValue={values.address?.postalCode} />
        <TextField label="Country" name="country" defaultValue={values.address?.country ?? "Nepal"} />
        <TextField label="Areas served" name="areaServed" defaultValue={values.areaServed?.join(", ")} hint="Comma-separated — used for local SEO." />
        <TextField label="Currency" name="currency" defaultValue={values.currency ?? "NPR"} />
        <TextField label="Time zone" name="timezone" defaultValue={values.timezone ?? "Asia/Kathmandu"} />
        <MediaPicker name="logoId" label="Logo (light backgrounds)" media={media} defaultValue={values.logo?.mediaId} />
        <MediaPicker name="logoOnDarkId" label="Logo (dark backgrounds)" media={media} defaultValue={values.logoOnDark?.mediaId} />
      </div>
    </ActionForm>
  );
}

export function QuotationSettingsForm({ values }: { values: { terms: string; termsVersion: string; taxRate: number; depositAmount: number; validityDays: number } }) {
  return (
    <ActionForm action={saveQuotationSettings} success="Quotation defaults saved">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Tax / VAT %" name="taxRate" type="number" min={0} max={100} step="0.01" defaultValue={values.taxRate} />
        <TextField label="Default advance (NPR)" name="depositAmount" type="number" min={0} step={1} defaultValue={values.depositAmount} hint="Filled in on new quotations; change it per quote. 0 = no advance by default." />
        <TextField label="Valid for (days)" name="validityDays" type="number" min={1} defaultValue={values.validityDays} />
      </div>
      <TextArea label="Default terms & conditions" name="terms" rows={9} defaultValue={values.terms} />
      <TextField label="Terms version" name="termsVersion" defaultValue={values.termsVersion} hint="Change it when the terms change — accepted quotes record the version." />
    </ActionForm>
  );
}

export function InvoiceSettingsForm({ values }: { values: { dueDays?: number; notes?: string; bankDetails?: string } }) {
  return (
    <ActionForm action={saveInvoiceSettings} success="Invoice settings saved">
      <TextField label="Payment due after (days)" name="dueDays" type="number" min={0} defaultValue={values.dueDays ?? 7} />
      <TextArea label="Footer note" name="notes" rows={2} defaultValue={values.notes} />
      <TextArea label="Bank / payment details" name="bankDetails" rows={4} defaultValue={values.bankDetails} hint="Printed on invoices." />
    </ActionForm>
  );
}

export function NotificationSettingsForm({ values }: { values: { emailNewInquiry?: boolean; emailPaymentReceived?: boolean } }) {
  return (
    <ActionForm action={saveNotificationSettings} success="Saved">
      <CheckboxField name="emailNewInquiry" label="Email the team about new inquiries" defaultChecked={values.emailNewInquiry} />
      <CheckboxField name="emailPaymentReceived" label="Email the team when a payment is recorded" defaultChecked={values.emailPaymentReceived} />
    </ActionForm>
  );
}

export function AutomationRow({ rule }: { rule: { key: string; name: string; enabled: boolean; config: Record<string, number | boolean | string> } }) {
  const flags = Object.entries(rule.config).filter(([, v]) => typeof v === "boolean");
  return (
    <DialogButton label={<span className="sr-only">Configure {rule.name}</span>} icon={Pencil} size="icon-sm" variant="ghost" title={rule.name}>
      {(close) => (
        <ActionForm action={saveAutomationRule} extra={{ key: rule.key }} success="Automation saved" onSuccess={close} onCancel={close}>
          <CheckboxField name="enabled" label="Enabled" defaultChecked={rule.enabled} />
          {"daysBefore" in rule.config && <TextField label="Days before" name="daysBefore" type="number" min={0} defaultValue={Number(rule.config.daysBefore)} />}
          {flags.map(([k, v]) => (
            <CheckboxField key={k} name={`flag:${k}`} label={k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} defaultChecked={!!v} />
          ))}
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function RunAutomationsButton() {
  const { run, pending } = useRun();
  const toast = useToast();
  return (
    <Button icon={Play} pending={pending} onClick={() => run(() => runAutomationsNow({}), { onSuccess: (d) => toast("success", d.results.length ? d.results.join(" · ") : "Nothing needed attention") })}>
      Run daily checks now
    </Button>
  );
}

export function SourceButton({ values }: { values?: { key: string; name: string; active: boolean; position: number } }) {
  return (
    <DialogButton label={values ? <span className="sr-only">Edit</span> : "Add source"} icon={values ? Pencil : Plus} size={values ? "icon-sm" : "sm"} variant={values ? "ghost" : "secondary"} title={values ? "Edit lead source" : "New lead source"}>
      {(close) => (
        <ActionForm action={saveSource} extra={{ isNew: !values, ...(values ? { key: values.key } : {}) }} success="Saved" onSuccess={close} onCancel={close}>
          {!values && <TextField label="Code" name="key" required placeholder="WEDDING_EXPO" />}
          <TextField label="Name" name="name" required defaultValue={values?.name} />
          <TextField label="Order" name="position" type="number" defaultValue={values?.position ?? 0} />
          <CheckboxField name="active" label="Active" defaultChecked={values?.active ?? true} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ExpenseCategoryButton({ values }: { values?: { id: string; name: string } }) {
  return (
    <DialogButton label={values ? <span className="sr-only">Rename</span> : "Add category"} icon={values ? Pencil : Plus} size={values ? "icon-sm" : "sm"} variant={values ? "ghost" : "secondary"} title={values ? "Rename category" : "New expense category"}>
      {(close) => (
        <ActionForm action={saveExpenseCategory} extra={{ id: values?.id ?? null }} success="Saved" onSuccess={close} onCancel={close}>
          <TextField label="Name" name="name" required defaultValue={values?.name} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ChecklistButton({ values }: { values?: { id: string; name: string; phase: string; items: string[] } }) {
  return (
    <DialogButton label={values ? <span className="sr-only">Edit</span> : "Add checklist"} icon={values ? Pencil : Plus} size={values ? "icon-sm" : "sm"} variant={values ? "ghost" : "secondary"} title={values ? "Edit checklist" : "New checklist"}>
      {(close) => (
        <ActionForm action={saveChecklist} extra={{ id: values?.id ?? null }} success="Saved" onSuccess={close} onCancel={close}>
          <TextField label="Name" name="name" required defaultValue={values?.name} />
          <SelectField
            label="When"
            name="phase"
            defaultValue={values?.phase ?? "PRE"}
            options={[
              { value: "PRE", label: "Before the event" },
              { value: "POST", label: "After the event" },
            ]}
          />
          <TextArea label="Items (one per line)" name="items" rows={8} defaultValue={values?.items.join("\n")} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function DeleteChecklistButton({ id }: { id: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title="Delete this checklist?" body="Tasks already added to events stay." confirmLabel="Delete" action={() => deleteChecklist({ id })}>
      <span className="sr-only">Delete</span>
    </ConfirmButton>
  );
}

export function StageButton({ values }: { values: { key: string; name: string } }) {
  return (
    <DialogButton label={<span className="sr-only">Rename</span>} icon={Pencil} size="icon-sm" variant="ghost" title="Rename stage">
      {(close) => (
        <ActionForm action={saveStageName} extra={{ key: values.key }} success="Saved" onSuccess={close} onCancel={close}>
          <TextField label="Name" name="name" required defaultValue={values.name} />
        </ActionForm>
      )}
    </DialogButton>
  );
}
