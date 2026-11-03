/**
 * Work progress — one definition for events, work orders, the calendar and the staff portal:
 *
 *   progress = completed required tasks ÷ required tasks × 100
 *
 * A task is "required" unless it was cancelled or a manager marked it optional
 * (event_tasks.counts_toward_progress = false). Cancelled and optional tasks are still listed,
 * they just can't inflate or hold back the percentage. No tasks → 0% (nothing planned yet).
 */
export type ProgressTask = { status: string; dueAt?: Date | string | null; countsTowardProgress?: boolean | null };

export type Progress = {
  /** Required tasks (not cancelled, not optional). */
  total: number;
  done: number;
  /** Required, not done, past the deadline. Tasks waiting for review aren't late — the team has finished. */
  overdue: number;
  /** Required, not done. */
  open: number;
  /** Whole percent, 0–100. */
  percent: number;
};

export const isRequired = (t: ProgressTask) => t.status !== "CANCELLED" && t.countsTowardProgress !== false;

export function progressOf(tasks: Iterable<ProgressTask>, now: number = Date.now()): Progress {
  let total = 0;
  let done = 0;
  let overdue = 0;
  for (const t of tasks) {
    if (!isRequired(t)) continue;
    total++;
    if (t.status === "COMPLETED") done++;
    else if (t.status !== "REVIEW" && t.dueAt && new Date(t.dueAt).getTime() < now) overdue++;
  }
  return { total, done, overdue, open: total - done, percent: total ? Math.round((done / total) * 100) : 0 };
}

/** Group tasks by a key (event id, work order id…) and work out each group's progress. */
export function progressBy<T extends ProgressTask>(tasks: Iterable<T>, key: (t: T) => string | null | undefined, now: number = Date.now()) {
  const groups = new Map<string, T[]>();
  for (const t of tasks) {
    const k = key(t);
    if (!k) continue;
    const list = groups.get(k) ?? [];
    list.push(t);
    groups.set(k, list);
  }
  return new Map([...groups].map(([k, list]) => [k, progressOf(list, now)] as const));
}

export const EMPTY_PROGRESS: Progress = { total: 0, done: 0, overdue: 0, open: 0, percent: 0 };
