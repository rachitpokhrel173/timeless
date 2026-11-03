"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { ActionForm, Button, inputClass, TextArea, TextField, useRun } from "@/components/admin/interactive";
import { saveContactDraft, saveNavigationDraft } from "./actions";

export const DRAFT_SAVED = "Draft saved — preview it, then publish";

export type ContactValues = { name: string; email: string; phones: string; whatsapp: string; street: string; city: string; postalCode: string; hours: string; mapUrl: string };

/** Contact details (saved as a draft of the business details; published from the panel beside it). */
export function ContactForm({ values }: { values: ContactValues }) {
  return (
    <ActionForm action={saveContactDraft} submitLabel="Save draft" success={DRAFT_SAVED}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Business name" name="name" required defaultValue={values.name} wrapClassName="sm:col-span-2" />
        <TextArea label="Phone numbers" name="phones" rows={3} required defaultValue={values.phones} hint="One per line, as shown on the site. Optional: “984-5411029 | +9779845411029”." />
        <div className="space-y-4">
          <TextField label="Email" name="email" type="email" required defaultValue={values.email} />
          <TextField label="WhatsApp number" name="whatsapp" defaultValue={values.whatsapp} hint="With the country code, digits only: 9779845411029" />
        </div>
        <TextField label="Street / area" name="street" required defaultValue={values.street} />
        <TextField label="City" name="city" required defaultValue={values.city} />
        <TextField label="Postal code" name="postalCode" defaultValue={values.postalCode} />
        <TextField label="Business hours" name="hours" defaultValue={values.hours} placeholder="Sun–Fri, 10am–6pm" hint="Shown on the contact page and footer. Leave empty to hide." />
        <TextField
          label="Google Maps link"
          name="mapUrl"
          type="url"
          defaultValue={values.mapUrl}
          placeholder="https://maps.app.goo.gl/…"
          wrapClassName="sm:col-span-2"
          hint="Adds an “Open in Google Maps” link on the contact page."
        />
      </div>
    </ActionForm>
  );
}

type NavRow = { label: string; href: string };

/** Header/footer menu, footer text and copyright line (saved as a draft). */
export function NavigationForm({ values, destinations }: { values: { links: NavRow[]; footerText: string; copyright: string }; destinations: { value: string; label: string }[] }) {
  const [links, setLinks] = useState<NavRow[]>(values.links);
  const [footerText, setFooterText] = useState(values.footerText);
  const [copyright, setCopyright] = useState(values.copyright);
  const [dirty, setDirty] = useState(false);
  const { run, pending } = useRun();
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const update = (next: NavRow[]) => {
    setLinks(next);
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= links.length) return;
    const next = [...links];
    [next[i], next[j]] = [next[j]!, next[i]!];
    update(next);
  };
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[13px] font-medium">Menu links</p>
        <ul className="space-y-2">
          {links.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Label"
                value={l.label}
                maxLength={30}
                onChange={(e) => update(links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))}
                className={`${inputClass} w-40`}
              />
              <select aria-label="Page" value={l.href} onChange={(e) => update(links.map((x, k) => (k === i ? { ...x, href: e.target.value } : x)))} className={`${inputClass} w-auto min-w-48 flex-1`}>
                {!destinations.some((d) => d.value === l.href) && <option value={l.href}>{l.href}</option>}
                {destinations.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <Button size="icon-sm" variant="ghost" icon={ArrowUp} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
              <Button size="icon-sm" variant="ghost" icon={ArrowDown} aria-label="Move down" disabled={i === links.length - 1} onClick={() => move(i, 1)} />
              <Button size="icon-sm" variant="danger-ghost" icon={Trash2} aria-label="Remove link" disabled={links.length <= 1} onClick={() => update(links.filter((_, k) => k !== i))} />
            </li>
          ))}
        </ul>
        {links.length < 8 && (
          <Button size="sm" icon={Plus} className="mt-2" onClick={() => update([...links, { label: "", href: destinations[0]?.value ?? "/" }])}>
            Add link
          </Button>
        )}
        <p className="mt-2 text-xs text-a-muted">Links can only go to pages of this website. The Contact page must stay in the menu.</p>
      </div>
      <TextArea
        label="Footer text"
        name="footerText"
        rows={2}
        maxLength={300}
        value={footerText}
        onChange={(e) => {
          setFooterText(e.target.value);
          setDirty(true);
        }}
        hint="A short line under the logo in the footer. Leave empty to hide."
      />
      <TextField
        label="Copyright line"
        name="copyright"
        maxLength={160}
        value={copyright}
        onChange={(e) => {
          setCopyright(e.target.value);
          setDirty(true);
        }}
        placeholder="© {year} Timeless Ties Events & Decor. All rights reserved."
        hint="{year} becomes the current year. Leave empty for the default line."
      />
      <div className="flex items-center justify-end gap-2 border-t border-a-border pt-3">
        {dirty && <span className="mr-auto text-xs text-a-warning">Unsaved changes</span>}
        <Button variant="primary" pending={pending} disabled={!dirty} onClick={() => run(() => saveNavigationDraft({ links, footerText, copyright }), { success: DRAFT_SAVED, onSuccess: () => setDirty(false) })}>
          Save draft
        </Button>
      </div>
    </div>
  );
}
