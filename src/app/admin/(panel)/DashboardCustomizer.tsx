"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, LayoutGrid } from "lucide-react";
import { Button, Dialog, useRun } from "@/components/admin/interactive";
import { setDashboardWidgets } from "./account/actions";

type W = { key: string; label: string };

/** Choose and order dashboard widgets; saved per admin. */
export default function DashboardCustomizer({ current, available }: { current: string[]; available: W[] }) {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<W[]>([]);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const { run, pending } = useRun();

  const start = () => {
    const shown = current.map((k) => available.find((a) => a.key === k)).filter((x): x is W => !!x);
    setOrder([...shown, ...available.filter((a) => !current.includes(a.key))]);
    setEnabled(new Set(current));
    setOpen(true);
  };

  const move = (i: number, dir: -1 | 1) =>
    setOrder((o) => {
      const next = [...o];
      const j = i + dir;
      if (j < 0 || j >= next.length) return o;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <>
      <Button size="sm" icon={LayoutGrid} onClick={start}>
        Customise
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Customise dashboard"
        description="Choose which widgets you see and in what order. Only you see these changes."
        size="sm"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              pending={pending}
              onClick={() =>
                run(() => setDashboardWidgets({ widgets: order.filter((w) => enabled.has(w.key)).map((w) => w.key) }), {
                  success: "Dashboard updated",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <ul className="divide-y divide-a-border">
          {order.map((w, i) => (
            <li key={w.key} className="flex items-center gap-2 py-2">
              <label className="flex flex-1 items-center gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={enabled.has(w.key)}
                  onChange={() =>
                    setEnabled((s) => {
                      const n = new Set(s);
                      if (n.has(w.key)) n.delete(w.key);
                      else n.add(w.key);
                      return n;
                    })
                  }
                  className="size-4 accent-[var(--a-accent)]"
                />
                {w.label}
              </label>
              <Button size="icon-sm" variant="ghost" aria-label={`Move ${w.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="size-4" />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Move ${w.label} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
