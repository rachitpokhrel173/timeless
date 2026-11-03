"use client";

import { useRun } from "@/components/admin/interactive";
import { setTaskRequired } from "./progress-actions";

/** Required ↔ optional switch: optional tasks stay on the list but don't count toward progress. */
export function RequiredToggle({ id, required, title }: { id: string; required: boolean; title: string }) {
  const { run, pending } = useRun();
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-a-muted" title="Optional tasks don't count toward event progress">
      <input
        type="checkbox"
        checked={required}
        disabled={pending}
        aria-label={`Count “${title}” toward progress`}
        onChange={() => run(() => setTaskRequired({ id, required: !required }), { success: required ? "Marked optional" : "Marked required" })}
        className="size-3.5 accent-[var(--a-accent)]"
      />
      Required
    </label>
  );
}
