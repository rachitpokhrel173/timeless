/** Shown instantly while a staff-portal page loads (the header stays put). */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="space-y-3 motion-safe:animate-pulse">
      <div className="h-6 w-44 rounded-md bg-a-border/70" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-a-border bg-a-surface p-4">
          <div className="mb-2 h-4 w-2/3 rounded bg-a-border/60" />
          <div className="h-3 w-1/3 rounded bg-a-border/40" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
