/**
 * Shown instantly while an admin page loads on the server, inside the sidebar shell (which stays
 * put). Without it a click looks like it did nothing until the whole page arrives.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="motion-safe:animate-pulse">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-md bg-a-border/70" />
          <div className="h-4 w-80 max-w-[70vw] rounded bg-a-border/50" />
        </div>
        <div className="hidden h-9 w-32 rounded-lg bg-a-border/60 sm:block" />
      </div>
      <div className="mb-4 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-a-border/50" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-a-border bg-a-surface">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-a-border px-4 py-3.5 last:border-0">
            <div className="size-8 shrink-0 rounded-full bg-a-border/60" />
            <div className="h-4 flex-1 rounded bg-a-border/50" />
            <div className="hidden h-4 w-24 rounded bg-a-border/40 md:block" />
            <div className="h-6 w-16 rounded-full bg-a-border/40" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
