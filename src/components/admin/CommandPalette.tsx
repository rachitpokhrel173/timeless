"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Boxes,
  CalendarCheck,
  CalendarDays,
  Contact,
  CornerDownLeft,
  FilePlus2,
  FileText,
  Inbox,
  LoaderCircle,
  PartyPopper,
  Receipt,
  Search,
  Settings,
  Store,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { allowed, NAV } from "./nav";

export type SearchHit = { type: string; id: string; title: string; subtitle?: string; href: string };

type Entry = { key: string; label: string; hint?: string; href: string; icon: LucideIcon; group: string };

const ACTIONS: (Omit<Entry, "group" | "key"> & { perm: string })[] = [
  { label: "Search customers", href: "/admin/customers", icon: Contact, perm: "customers.view" },
  { label: "Search bookings", href: "/admin/bookings", icon: CalendarCheck, perm: "bookings.view" },
  { label: "Create inquiry", href: "/admin/inquiries/new", icon: Inbox, perm: "leads.create" },
  { label: "Create quotation", href: "/admin/quotations/new", icon: FilePlus2, perm: "quotations.create" },
  { label: "Create booking", href: "/admin/bookings/new", icon: CalendarCheck, perm: "bookings.create" },
  { label: "Create customer", href: "/admin/customers/new", icon: UserPlus, perm: "customers.create" },
  { label: "Open calendar", href: "/admin/calendar", icon: CalendarDays, perm: "events.view" },
  { label: "Open inventory", href: "/admin/inventory", icon: Boxes, perm: "inventory.view" },
  { label: "Open settings", href: "/admin/settings", icon: Settings, perm: "settings.manage" },
];

const TYPE_ICON: Record<string, LucideIcon> = {
  Customer: Contact,
  Lead: UserPlus,
  Inquiry: Inbox,
  Quotation: FileText,
  Booking: CalendarCheck,
  Event: PartyPopper,
  Invoice: Receipt,
  Inventory: Boxes,
  Vendor: Store,
  Staff: UsersRound,
};

export default function CommandPalette({
  open,
  onClose,
  permissions,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  permissions: string[];
  onNavigate: (href: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const perms = useMemo(() => new Set(permissions), [permissions]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setQuery("");
      setHits([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (!open && el.open) el.close();
  }, [open]);

  // Debounced server search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) setHits((await res.json()).results);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const entries: Entry[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const actions = ACTIONS.filter((a) => perms.has(a.perm) && match(a.label)).map((a) => ({ ...a, key: `a:${a.href}`, group: "Actions" }));
    const pages = NAV.flatMap((g) =>
      g.items
        .filter((i) => allowed(i, perms) && (match(i.label) || match(g.label)))
        .map((i) => ({ key: `p:${i.href}`, label: i.label, hint: g.label, href: i.href, icon: i.icon, group: "Pages" })),
    ).slice(0, q ? 8 : 6);
    const results = hits.map((h) => ({
      key: `r:${h.type}:${h.id}`,
      label: h.title,
      hint: [h.type, h.subtitle].filter(Boolean).join(" · "),
      href: h.href,
      icon: TYPE_ICON[h.type] ?? Search,
      group: "Records",
    }));
    return [...results, ...actions, ...pages];
  }, [hits, perms, query]);

  useEffect(() => setActive(0), [query, hits.length]);

  const go = (entry?: Entry) => {
    if (!entry) return;
    onClose();
    onNavigate(entry.href);
  };

  let lastGroup = "";
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Search and commands"
      className="mx-auto mt-[12vh] w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-xl border border-a-border bg-a-surface p-0 text-a-text shadow-2xl backdrop:bg-black/40"
    >
      {open && (
        <div>
          <div className="flex items-center gap-2 border-b border-a-border px-3.5">
            {loading ? <LoaderCircle className="size-4 animate-spin text-a-muted" aria-hidden /> : <Search className="size-4 text-a-muted" aria-hidden />}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(entries.length - 1, a + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(entries[active]);
                }
              }}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={entries[active] ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              placeholder="Search customers, leads, bookings, invoices… or type a command"
              className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-a-muted"
            />
            <kbd className="rounded border border-a-border px-1.5 text-[11px] text-a-muted">Esc</kbd>
          </div>
          <ul id={listId} role="listbox" className="max-h-[55vh] overflow-y-auto p-1.5">
            {entries.length === 0 && (
              <li className="px-3 py-8 text-center text-[13px] text-a-muted">{query.trim().length >= 2 && !loading ? `No matches for “${query}”.` : "Start typing to search."}</li>
            )}
            {entries.map((entry, i) => {
              const header = entry.group !== lastGroup;
              lastGroup = entry.group;
              return (
                <li key={entry.key} role="presentation">
                  {header && <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-a-muted uppercase">{entry.group}</p>}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(entry)}
                    className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px]", i === active && "bg-a-hover")}
                  >
                    <entry.icon className="size-4 shrink-0 text-a-muted" aria-hidden />
                    <span className="truncate font-medium">{entry.label}</span>
                    {entry.hint && <span className="truncate text-xs text-a-muted">{entry.hint}</span>}
                    {i === active && <CornerDownLeft className="ml-auto size-3.5 shrink-0 text-a-muted" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </dialog>
  );
}
