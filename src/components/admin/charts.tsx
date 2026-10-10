"use client";

/*
 * Small, dependency-free SVG/HTML charts for the admin.
 * Spec: thin marks (≤24px bars, 4px rounded data end, square at baseline), 2px surface gaps,
 * hairline recessive grid, hover tooltips, legend for ≥2 series, text in ink tokens (never the
 * series colour), and a table view for every chart. Series colours come from the validated
 * --a-s1…--a-s4 tokens in globals.css, assigned in fixed order.
 */
import { useId, useMemo, useState } from "react";
import { npr, nprCompact, num } from "@/lib/format";
import { cn } from "@/lib/utils";

const SERIES = ["var(--a-s1)", "var(--a-s2)", "var(--a-s3)", "var(--a-s4)"];

/** Formats are named (not functions) so server components can pass them to these client charts. */
export type ValueFormat = "npr" | "nprCompact" | "number" | "leads" | "percent";
const FORMATS: Record<ValueFormat, (n: number) => string> = {
  npr,
  nprCompact,
  number: (n) => num(n),
  leads: (n) => `${num(n)} lead${n === 1 ? "" : "s"}`,
  percent: (n) => `${Math.round(n)}%`,
};

function niceMax(max: number) {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Axis tick label; the unit is picked from the axis maximum so every tick uses the same one. */
const compact = (n: number, max = n) => {
  if (n === 0) return "0";
  if (max >= 1e7) return `${+(n / 1e7).toFixed(2)}Cr`;
  if (max >= 1e5) return `${+(n / 1e5).toFixed(2)}L`;
  if (max >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
};

/** "View as table" disclosure — every chart has one. */
function TableView({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs text-a-muted">
      <summary className="cursor-pointer select-none hover:text-a-text">View as table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} scope="col" className="border-b border-a-border py-1 pr-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="border-b border-a-border py-1 pr-3 text-a-text tabular-nums">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Legend({ series }: { series: { name: string; color: string }[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-a-muted">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Vertical columns over categories (e.g. months), one or more series grouped side by side.
 * Values share one axis — never use this for measures on different scales.
 */
export function ColumnChart({
  labels,
  series,
  format: formatKey = "number",
  height = 220,
  ariaLabel,
}: {
  labels: string[];
  series: { name: string; values: number[] }[];
  format?: ValueFormat;
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const format = FORMATS[formatKey];
  const colored = series.slice(0, 4).map((s, i) => ({ ...s, color: SERIES[i] }));
  const max = niceMax(Math.max(0, ...colored.flatMap((s) => s.values)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 8, t: 10, b: 26 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / Math.max(1, labels.length);
  const gap = 2;
  const barW = Math.min(24, (band * 0.7 - gap * (colored.length - 1)) / colored.length);
  const groupW = barW * colored.length + gap * (colored.length - 1);
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;
  const every = labels.length > 12 ? Math.ceil(labels.length / 12) : 1;

  return (
    <figure aria-label={ariaLabel} className="relative">
      <Legend series={colored} />
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--a-grid)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-a-muted text-[10px]">
              {compact(t, max)}
            </text>
          </g>
        ))}
        {labels.map((label, i) => {
          const x0 = pad.l + band * i + (band - groupW) / 2;
          return (
            <g key={label + i}>
              {hover === i && <rect x={pad.l + band * i} y={pad.t} width={band} height={plotH} fill="var(--a-hover)" opacity={0.6} />}
              {colored.map((s, si) => {
                const v = s.values[i] ?? 0;
                const h = Math.max(0, (v / max) * plotH);
                const x = x0 + si * (barW + gap);
                const r = Math.min(4, h / 2, barW / 2);
                const top = pad.t + plotH - h;
                // Rounded top, square baseline
                const d = h <= 0 ? "" : `M${x},${pad.t + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${pad.t + plotH} Z`;
                return d ? <path key={s.name} d={d} fill={s.color} /> : null;
              })}
              {i % every === 0 && (
                <text x={pad.l + band * i + band / 2} y={H - 8} textAnchor="middle" className="fill-a-muted text-[10px]">
                  {label}
                </text>
              )}
              {/* Hit target: the whole band, larger than the marks */}
              <rect x={pad.l + band * i} y={pad.t} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + plotH} y2={pad.t + plotH} stroke="var(--a-strong)" strokeWidth={1} />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-6 z-10 min-w-36 rounded-md border border-a-border bg-a-surface px-2.5 py-2 text-xs shadow-lg"
          style={{ left: `clamp(0px, calc(${((pad.l + band * hover + band / 2) / W) * 100}% - 72px), calc(100% - 150px))` }}
        >
          <p className="mb-1 font-semibold text-a-text">{labels[hover]}</p>
          {colored.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-3 text-a-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
                {s.name}
              </span>
              <span className="font-medium text-a-text tabular-nums">{format(s.values[hover] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
      <TableView headers={["", ...colored.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...colored.map((s) => format(s.values[i] ?? 0))])} />
    </figure>
  );
}

/** Ranked horizontal bars for categories (revenue by source, events by type…). Single series. */
export function BarList({
  items,
  format: formatKey = "number",
  ariaLabel,
  max: maxItems = 8,
  empty = "No data for this period.",
}: {
  items: { label: string; value: number; note?: string }[];
  format?: ValueFormat;
  ariaLabel: string;
  max?: number;
  empty?: string;
}) {
  const format = FORMATS[formatKey];
  const sorted = useMemo(() => [...items].sort((a, b) => b.value - a.value), [items]);
  // Long tails fold into "Other" instead of generating more rows
  const shown = sorted.length > maxItems ? [...sorted.slice(0, maxItems - 1), { label: "Other", value: sorted.slice(maxItems - 1).reduce((s, x) => s + x.value, 0) }] : sorted;
  const max = Math.max(1, ...shown.map((i) => i.value));
  if (!shown.length || shown.every((i) => i.value === 0)) return <p className="py-6 text-center text-[13px] text-a-muted">{empty}</p>;
  return (
    <figure aria-label={ariaLabel}>
      <ul className="space-y-2.5">
        {shown.map((item) => (
          <li key={item.label} title={`${item.label}: ${format(item.value)}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate">{item.label}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {format(item.value)}
                {"note" in item && item.note && <span className="ml-1.5 font-normal text-a-muted">{item.note}</span>}
              </span>
            </div>
            <div className="h-2 rounded-r-[4px] bg-a-subtle" aria-hidden>
              <div className="h-full rounded-r-[4px]" style={{ width: `${(item.value / max) * 100}%`, background: SERIES[0] }} />
            </div>
          </li>
        ))}
      </ul>
      <TableView headers={["Category", "Value"]} rows={shown.map((i) => [i.label, format(i.value)])} />
    </figure>
  );
}

/** Sales funnel: one ordinal hue, stage widths by count, conversion between stages. */
export function Funnel({ stages, ariaLabel }: { stages: { label: string; value: number }[]; ariaLabel: string }) {
  const id = useId();
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <figure aria-label={ariaLabel} aria-describedby={id}>
      <ol className="space-y-1">
        {stages.map((s, i) => {
          const prev = stages[i - 1]?.value;
          const conv = i > 0 && prev ? Math.round((s.value / prev) * 100) : null;
          return (
            <li key={s.label}>
              {conv !== null && <p className="py-0.5 pl-[38%] text-[11px] text-a-muted">↓ {conv}% continue</p>}
              <div className="flex items-center gap-3">
                <span className="w-[35%] shrink-0 truncate text-right text-[12px] text-a-muted">{s.label}</span>
                <div className="flex-1">
                  <div
                    className="flex h-6 items-center rounded-r-[4px] px-2 text-[12px] font-semibold text-a-on-accent"
                    style={{ width: `${Math.max(8, (s.value / max) * 100)}%`, background: "var(--a-s1)" }}
                  >
                    <span className={cn(s.value / max < 0.15 && "sr-only")}>{s.value}</span>
                  </div>
                </div>
                {s.value / max < 0.15 && <span className="text-[12px] font-semibold tabular-nums">{s.value}</span>}
              </div>
            </li>
          );
        })}
      </ol>
      <p id={id} className="sr-only">
        {stages.map((s) => `${s.label}: ${s.value}`).join(", ")}
      </p>
      <TableView
        headers={["Stage", "Count", "From previous"]}
        rows={stages.map((s, i) => [s.label, s.value, i > 0 && stages[i - 1].value ? `${Math.round((s.value / stages[i - 1].value) * 100)}%` : "—"])}
      />
    </figure>
  );
}
