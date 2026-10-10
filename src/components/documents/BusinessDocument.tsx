/*
 * Printable business documents (quotation, invoice, receipt). Plain server markup with print
 * styles, so "Print → Save as PDF" in any browser produces a clean A4 PDF.
 */
import type { ReactNode } from "react";
import { fmtDateLong, npr, num } from "@/lib/format";
import type { SiteSettings } from "@/types";

export type DocLine = { description: string; details?: string | null; quantity: number; unit?: string | null; unitPrice: number; amount: number };

export function BusinessDocument({
  brand,
  kind,
  number,
  meta,
  billTo,
  lines,
  totals,
  notes,
  terms,
  images,
  stamp,
  signature,
  footer,
}: {
  brand: SiteSettings;
  kind: string;
  number: string;
  meta: [string, ReactNode][];
  billTo: { name: string; lines: (string | null | undefined)[] };
  lines: DocLine[];
  totals: { label: string; value: number; strong?: boolean; negative?: boolean }[];
  notes?: string | null;
  terms?: string | null;
  /** Reference & inspiration photos */
  images?: { id: string; src: string; alt: string }[];
  stamp?: ReactNode;
  /** Signature lines; `acceptedOnline` fills the client's side with their typed name. */
  signature?: { acceptedOnline?: { name: string; at: Date | string } | null };
  footer?: ReactNode;
}) {
  const address = [brand.address.street, brand.address.city, brand.address.country].filter(Boolean).join(", ");
  return (
    <article className="doc mx-auto w-full max-w-[820px] bg-white px-6 py-8 text-[13px] leading-relaxed text-neutral-800 sm:px-10 sm:py-10 print:max-w-none print:p-0">
      <header className="flex flex-col gap-6 border-b border-neutral-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {brand.logo?.src && (
            // eslint-disable-next-line @next/next/no-img-element -- printed documents keep the original asset
            <img src={brand.logo.src} alt="" width={56} height={52} className="h-14 w-auto object-contain" />
          )}
          <div>
            <p className="font-serif text-xl leading-tight font-semibold text-[#5a1f2b]">{brand.name}</p>
            <p className="text-xs text-neutral-500">{address}</p>
            <p className="text-xs text-neutral-500">
              {brand.phones.map((p) => p.label).join(" · ")}
              {brand.email ? ` · ${brand.email}` : ""}
            </p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold tracking-[0.2em] text-[#a8864a] uppercase">{kind}</p>
          <p className="font-serif text-2xl font-semibold">{number}</p>
          {stamp}
        </div>
      </header>

      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">Prepared for</p>
          <p className="font-semibold">{billTo.name}</p>
          {billTo.lines.filter(Boolean).map((l, i) => (
            <p key={i} className="text-neutral-600">
              {l}
            </p>
          ))}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end">
          {meta.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-neutral-500">{k}</dt>
              <dd className="font-medium sm:text-right">{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-neutral-300 text-left text-[11px] tracking-wider text-neutral-500 uppercase">
            <th className="py-2 pr-2 font-semibold">Description</th>
            <th className="py-2 pr-2 text-right font-semibold">Qty</th>
            <th className="py-2 pr-2 text-right font-semibold">Rate</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-neutral-100 align-top break-inside-avoid">
              <td className="py-2.5 pr-2">
                <span className="font-medium">{l.description}</span>
                {l.details && <span className="block text-xs text-neutral-500">{l.details}</span>}
              </td>
              <td className="py-2.5 pr-2 text-right whitespace-nowrap tabular-nums">
                {num(l.quantity)} {l.unit}
              </td>
              <td className="py-2.5 pr-2 text-right whitespace-nowrap tabular-nums">{npr(l.unitPrice)}</td>
              <td className="py-2.5 text-right whitespace-nowrap tabular-nums">{npr(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-4 ml-auto w-full max-w-xs space-y-1.5 break-inside-avoid">
        {totals.map((t) => (
          <div key={t.label} className={`flex justify-between gap-4 ${t.strong ? "border-t border-neutral-300 pt-2 text-base font-semibold" : ""}`}>
            <dt>{t.label}</dt>
            <dd className="tabular-nums">
              {t.negative ? "− " : ""}
              {npr(t.value)}
            </dd>
          </div>
        ))}
      </dl>

      {images && images.length > 0 && (
        <section className="mt-8">
          <p className="mb-3 text-[11px] font-semibold tracking-wider text-[#a8864a] uppercase">Reference &amp; inspiration</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed links, printed as-is
              <img key={img.id} src={img.src} alt={img.alt} loading="lazy" className="aspect-square w-full break-inside-avoid rounded-xl border border-neutral-200 object-cover" />
            ))}
          </div>
        </section>
      )}
      {notes && (
        <section className="mt-8 break-inside-avoid">
          <p className="mb-1 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">Notes</p>
          <p className="whitespace-pre-line">{notes}</p>
        </section>
      )}
      {terms && (
        <section className="mt-6 break-inside-avoid">
          <p className="mb-1 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">Terms & conditions</p>
          <p className="text-xs whitespace-pre-line text-neutral-600">{terms}</p>
        </section>
      )}
      {signature && (
        <section className="mt-12 grid gap-10 break-inside-avoid sm:grid-cols-2 sm:gap-12">
          <div>
            <div className="h-10" />
            <div className="border-t border-neutral-300 pt-2">
              <p className="font-medium">For {brand.name}</p>
              <p className="text-xs text-neutral-500">Authorised Signatory</p>
            </div>
          </div>
          <div>
            <p className="flex h-10 items-end pb-1 font-serif text-xl text-neutral-800 italic">{signature.acceptedOnline?.name}</p>
            <div className="border-t border-neutral-300 pt-2">
              <p className="font-medium">Client Acceptance</p>
              {signature.acceptedOnline ? (
                <p className="text-xs text-emerald-700">Accepted online · {fmtDateLong(signature.acceptedOnline.at)}</p>
              ) : (
                <p className="text-xs text-neutral-500">Signature &amp; date</p>
              )}
            </div>
          </div>
        </section>
      )}
      <footer className="mt-10 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-500">
        <p>{footer ?? `Thank you for choosing ${brand.shortName}.`}</p>
        <p className="mt-1">
          This is a system-generated {kind.split(" · ")[0].toLowerCase()} from {brand.shortName} · Generated {fmtDateLong(new Date())}
        </p>
      </footer>
    </article>
  );
}
