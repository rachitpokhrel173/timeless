/** Display helpers shared by admin, client portal and PDFs. Safe for client components. */

const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** NPR 4,85,000 (South Asian grouping, as used in Nepal). */
export const npr = (amount: number | null | undefined) => `NPR ${nf.format(Math.round(amount ?? 0))}`;
export const num = (n: number | null | undefined) => nf.format(n ?? 0);

/** Compact money for KPI tiles: NPR 4.85L, NPR 1.2Cr. */
export function nprCompact(amount: number) {
  const abs = Math.abs(amount);
  if (abs >= 1e7) return `NPR ${(amount / 1e7).toFixed(abs >= 1e8 ? 0 : 2).replace(/\.?0+$/, "")}Cr`;
  if (abs >= 1e5) return `NPR ${(amount / 1e5).toFixed(2).replace(/\.?0+$/, "")}L`;
  return npr(amount);
}

const asDate = (d: Date | string) => (typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d);

/** 12 Oct 2026 */
export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(asDate(d)) : "—";

/** 12 October 2026 */
export const fmtDateLong = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(asDate(d)) : "—";

/** 12 Oct 2026, 20:42 */
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: TIMEZONE,
      }).format(asDate(d))
    : "—";

export const fmtTime = (d: Date | string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIMEZONE }).format(asDate(d))
    : "—";

/** "Mon, 12 Oct" */
export const fmtDay = (d: Date | string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(asDate(d));

/** Business timezone — Nepal. Used to decide what "today" means for follow-ups and reminders. */
export const TIMEZONE = "Asia/Kathmandu";

/** YYYY-MM-DD for "today" in Nepal. */
export function todayISO(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(d);
}

export function relativeTime(d: Date | string) {
  const diff = (asDate(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return fmtDate(d);
}

/** Percentage change between two values, or null when there's no baseline. */
export function pctChange(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
