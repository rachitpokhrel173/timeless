"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, X } from "lucide-react";
import type { CatalogueSection } from "@/types";
import { cn, formatPrice } from "@/lib/utils";

/**
 * Inquiry-form picker for catalogue designs. Every section stays mounted (inactive tabs are
 * just hidden) so all ticked checkboxes are submitted, whichever tab is open.
 */
export default function CataloguePicker({ sections, defaultSelected = [] }: { sections: CatalogueSection[]; defaultSelected?: string[] }) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [active, setActive] = useState(
    () => sections.find((s) => s.items.some((i) => defaultSelected.includes(i.id)))?.slug ?? sections[0]?.slug,
  );

  const items = sections.flatMap((s) => s.items);
  const picked = items.filter((i) => selected.includes(i.id));
  // Only flat prices add up; per-foot and per-piece items depend on measurements
  const flatTotal = picked.reduce((sum, i) => sum + (i.price.amount !== undefined && !i.price.unit ? i.price.amount : 0), 0);
  const hasVariable = picked.some((i) => i.price.amount === undefined || i.price.unit);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <fieldset>
      <legend className="text-sm font-medium">
        Choose designs from our catalogue <span className="font-normal text-muted">(optional)</span>
      </legend>
      <p className="mt-1 text-sm text-muted">Tick the setups you like — we&rsquo;ll adapt them to your colours and venue.</p>

      <div role="tablist" aria-label="Catalogue categories" className="scroll-row -mx-6 mt-4 flex gap-2 overflow-x-auto px-6 md:mx-0 md:flex-wrap md:px-0">
        {sections.map((s) => {
          const count = s.items.filter((i) => selected.includes(i.id)).length;
          return (
            <button
              key={s.slug}
              type="button"
              role="tab"
              id={`pick-tab-${s.slug}`}
              aria-selected={active === s.slug}
              aria-controls={`pick-panel-${s.slug}`}
              onClick={() => setActive(s.slug)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
                active === s.slug ? "border-ink bg-ink text-ivory" : "border-ink/15 text-ink/75 hover:border-ink hover:text-ink",
              )}
            >
              {s.name}
              {count > 0 && (
                <span className={cn("grid size-5 place-items-center rounded-full text-[0.7rem] font-semibold", active === s.slug ? "bg-ivory text-ink" : "bg-burgundy text-ivory")}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {sections.map((s) => (
        <div
          key={s.slug}
          role="tabpanel"
          id={`pick-panel-${s.slug}`}
          aria-labelledby={`pick-tab-${s.slug}`}
          hidden={active !== s.slug}
          className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {s.items.map((item) => {
            const on = selected.includes(item.id);
            return (
              <label
                key={item.id}
                className={cn(
                  "group cursor-pointer overflow-hidden rounded-lg bg-white ring-1 transition-[box-shadow] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold",
                  on ? "ring-2 ring-burgundy" : "ring-ink/10 hover:ring-ink/30",
                )}
              >
                <input type="checkbox" name="designs" value={item.id} checked={on} onChange={() => toggle(item.id)} className="sr-only" />
                <span className="relative block aspect-[4/3] overflow-hidden bg-cream">
                  <Image
                    src={item.image.src}
                    alt={item.image.alt}
                    fill
                    sizes="(min-width: 1024px) 200px, (min-width: 640px) 30vw, 50vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <span
                    className={cn(
                      "absolute top-2 right-2 grid size-7 place-items-center rounded-full border transition-colors",
                      on ? "border-burgundy bg-burgundy text-ivory" : "border-white/80 bg-ink/25 text-transparent",
                    )}
                    aria-hidden
                  >
                    <Check className="size-4" strokeWidth={2.5} />
                  </span>
                </span>
                <span className="block px-3 py-2.5">
                  <span className="block text-[0.85rem] leading-snug font-medium">{item.title}</span>
                  <span className={cn("mt-0.5 block text-[0.78rem]", item.price.amount === undefined ? "text-muted italic" : "text-burgundy")}>
                    {formatPrice(item.price)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ))}

      {picked.length > 0 && (
        <div className="mt-4 rounded-lg bg-sand/70 p-4" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              {picked.length} {picked.length === 1 ? "design" : "designs"} selected
            </p>
            {flatTotal > 0 && (
              <p className="text-sm text-muted">
                Approx. <span className="font-semibold text-burgundy">Rs {flatTotal.toLocaleString("en-IN")}</span>
                {hasVariable && " + measured items"}
              </p>
            )}
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {picked.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => toggle(i.id)}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-white pr-2.5 pl-3 text-[0.8rem] ring-1 ring-ink/10 hover:ring-burgundy"
                  aria-label={`Remove ${i.title}`}
                >
                  {i.title}
                  <X className="size-3.5 text-muted" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Final prices depend on date, venue and size — we&rsquo;ll confirm in your quote.</p>
        </div>
      )}
    </fieldset>
  );
}
