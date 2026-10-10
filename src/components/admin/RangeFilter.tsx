"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "./interactive";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "12m", label: "12M" },
];

/** Time-range control: presets plus a custom from/to, stored in the URL. */
export default function RangeFilter({ fallback = "30d" }: { fallback?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const custom = params.get("from");
  const active = custom ? "custom" : (params.get("range") ?? fallback);

  const go = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Time range" className="inline-flex rounded-md border border-a-border bg-a-surface p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={active === p.value}
            onClick={() => go({ range: p.value, from: null, to: null })}
            className={cn("rounded px-2.5 py-1 text-xs font-medium", active === p.value ? "bg-a-accent text-a-on-accent" : "text-a-muted hover:bg-a-hover hover:text-a-text")}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input type="date" aria-label="Custom range start" value={custom ?? ""} onChange={(e) => go({ from: e.target.value || null, range: null })} className={cn(inputClass, "h-8 w-auto text-xs")} />
        <span className="text-a-muted">–</span>
        <input type="date" aria-label="Custom range end" value={params.get("to") ?? ""} onChange={(e) => go({ to: e.target.value || null, range: null })} className={cn(inputClass, "h-8 w-auto text-xs")} />
      </div>
      {pending && <LoaderCircle className="size-4 animate-spin text-a-muted" aria-label="Updating" />}
    </div>
  );
}
