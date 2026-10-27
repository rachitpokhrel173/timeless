"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Button, inputClass, useToast } from "@/components/admin/interactive";
import { setRequestedServices } from "./actions";

/** Extra services a customer has asked for (Panche Baja, Pasni décor, …) — picked from the usual list or typed in. */
export default function RequestedServices({ customerId, services, suggestions, canEdit }: { customerId: string; services: string[]; suggestions: string[]; canEdit: boolean }) {
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const has = (s: string) => services.some((x) => x.toLowerCase() === s.toLowerCase());

  const save = (next: string[], done?: () => void) =>
    start(async () => {
      const r = await setRequestedServices({ id: customerId, services: next }).catch(() => ({ ok: false as const, error: "Couldn't save — try again." }));
      if (r.ok) {
        done?.();
        router.refresh();
      } else toast("error", r.error);
    });

  const add = () => {
    const s = draft.trim();
    if (!s) return;
    if (has(s)) return setDraft("");
    save([...services, s], () => setDraft(""));
  };

  return (
    <div className="space-y-3">
      {services.length === 0 ? (
        <p className="text-[13px] text-a-muted">Nothing yet — add Panche Baja, Pasni décor, DJ or anything else they&rsquo;ve asked for.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {services.map((s) => (
            <li key={s} className="flex items-center gap-1 rounded-full border border-a-border bg-a-subtle px-2.5 py-1 text-[13px]">
              {s}
              {canEdit && (
                <button type="button" onClick={() => save(services.filter((x) => x !== s))} disabled={pending} aria-label={`Remove ${s}`} className="rounded-full p-0.5 text-a-muted hover:text-a-text disabled:opacity-60">
                  <X className="size-3" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex gap-2">
          <input
            aria-label="Service"
            list={`services-${customerId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="e.g. Panche Baja"
            maxLength={120}
            className={`${inputClass} h-8`}
          />
          <datalist id={`services-${customerId}`}>
            {suggestions.filter((s) => !has(s)).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Button size="sm" icon={Plus} onClick={add} disabled={pending || !draft.trim()}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
