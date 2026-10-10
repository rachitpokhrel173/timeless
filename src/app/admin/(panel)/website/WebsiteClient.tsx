"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import ContentEditor from "@/components/admin/ContentEditor";
import MediaPicker, { type MediaOption } from "@/components/admin/MediaPicker";
import { ActionButton, ActionForm, CheckboxField, ConfirmButton, DialogButton, SelectField, TextArea, TextField } from "@/components/admin/interactive";
import { deleteSocialLink, moveSection, saveContentSetting, saveHomeSection, savePageSeo, saveSeoGlobal, saveSocialLink, setSectionStatus } from "./actions";

type Json = Parameters<typeof ContentEditor>[0]["initial"];

export function SectionEditor({ sectionKey, initial, media }: { sectionKey: string; initial: Json; media: MediaOption[] }) {
  return <ContentEditor initial={initial} media={media} onSave={(content) => saveHomeSection({ key: sectionKey, content })} saveLabel="Save section" />;
}

export function SettingEditor({ settingKey, initial, media }: { settingKey: "about" | "faqs" | "inquiry_options" | "catalogue_meta"; initial: Json; media: MediaOption[] }) {
  return <ContentEditor initial={initial} media={media} onSave={(content) => saveContentSetting({ key: settingKey, content })} />;
}

export function SectionControls({ sectionKey, published, first, last }: { sectionKey: string; published: boolean; first: boolean; last: boolean }) {
  return (
    <span className="flex items-center gap-0.5">
      <ActionButton size="icon-sm" variant="ghost" icon={ArrowUp} aria-label="Move up" disabled={first} action={() => moveSection({ key: sectionKey, direction: "up" })} />
      <ActionButton size="icon-sm" variant="ghost" icon={ArrowDown} aria-label="Move down" disabled={last} action={() => moveSection({ key: sectionKey, direction: "down" })} />
      <ActionButton
        size="sm"
        variant="ghost"
        icon={published ? EyeOff : Eye}
        action={() => setSectionStatus({ key: sectionKey, status: published ? "DRAFT" : "PUBLISHED" })}
        success={published ? "Hidden from the homepage" : "Shown on the homepage"}
      >
        {published ? "Hide" : "Show"}
      </ActionButton>
    </span>
  );
}

export function SeoGlobalForm({ values }: { values: { homeTitle?: string; homeDescription?: string; keywords?: string[] } }) {
  return (
    <ActionForm action={saveSeoGlobal} success="Default SEO saved">
      <TextField label="Homepage title" name="homeTitle" defaultValue={values.homeTitle} required maxLength={70} hint="Up to ~60 characters shows fully in Google." />
      <TextArea label="Homepage description" name="homeDescription" defaultValue={values.homeDescription} rows={2} required maxLength={170} hint="Up to ~155 characters." />
      <TextArea label="Focus keywords" name="keywords" defaultValue={values.keywords?.join(", ")} rows={2} hint="Comma-separated, used to guide copy — not stuffed into pages." />
    </ActionForm>
  );
}

export function PageSeoButton({ media, values }: { media: MediaOption[]; values?: { path: string; title: string | null; description: string | null; ogImageId: string | null; noindex: boolean } }) {
  return (
    <DialogButton label={values ? <span className="sr-only">Edit SEO</span> : "Add page"} icon={values ? Pencil : Plus} size={values ? "icon-sm" : "sm"} variant={values ? "ghost" : "secondary"} title={values ? `SEO for ${values.path}` : "Page SEO override"} dialogSize="lg">
      {(close) => (
        <ActionForm action={savePageSeo} success="SEO saved" onSuccess={close} onCancel={close} extra={values ? { path: values.path } : undefined}>
          {!values && <TextField label="Page path" name="path" required placeholder="/services" />}
          <TextField label="Title" name="title" defaultValue={values?.title ?? ""} maxLength={70} hint="Leave empty to use the page's built-in title." />
          <TextArea label="Description" name="description" defaultValue={values?.description ?? ""} rows={2} maxLength={170} />
          <MediaPicker name="ogImageId" label="Share image" media={media} defaultValue={values?.ogImageId} />
          <CheckboxField name="noindex" label="Hide this page from search engines" defaultChecked={values?.noindex} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
];

export function SocialLinkButton({ values }: { values?: { id: string; platform: string; label: string; url: string; handle: string | null; position: number } }) {
  return (
    <DialogButton label={values ? <span className="sr-only">Edit link</span> : "Add link"} icon={values ? Pencil : Plus} size={values ? "icon-sm" : "sm"} variant={values ? "ghost" : "secondary"} title={values ? "Edit social link" : "Add social link"}>
      {(close) => (
        <ActionForm action={saveSocialLink} extra={{ id: values?.id ?? null }} success="Saved" onSuccess={close} onCancel={close}>
          <SelectField label="Platform" name="platform" options={PLATFORMS} defaultValue={values?.platform ?? "instagram"} />
          <TextField label="Label" name="label" required defaultValue={values?.label ?? ""} placeholder="Instagram" />
          <TextField label="Profile URL" name="url" type="url" defaultValue={values?.url ?? ""} placeholder="https://instagram.com/…" hint="Empty links are hidden on the site." />
          <TextField label="Handle" name="handle" defaultValue={values?.handle ?? ""} placeholder="@timelessties" />
          <TextField label="Order" name="position" type="number" defaultValue={values?.position ?? 0} />
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function DeleteSocialLinkButton({ id }: { id: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title="Remove this link?" confirmLabel="Remove" action={() => deleteSocialLink({ id })}>
      <span className="sr-only">Remove</span>
    </ConfirmButton>
  );
}
