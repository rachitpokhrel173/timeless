/*
 * Admin UI primitives that render on the server (no hooks). Interactive pieces live in
 * ./interactive.tsx. Everything uses the semantic admin tokens (bg-a-*, text-a-*), so light and
 * dark themes come for free.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  Download,
  Clock,
  Info,
  Lock,
  Minus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────── Layout ───────── */

export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-a-muted hover:text-a-text">
            ← {back.label}
          </Link>
        )}
        {eyebrow && <div className="mb-1 text-xs font-semibold tracking-[0.14em] text-a-gold uppercase">{eyebrow}</div>}
        <h1 className="font-serif text-[1.9rem] leading-tight font-medium text-balance">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-a-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
  order,
}: {
  /** CSS order inside a grid (user-arranged dashboards). */
  order?: number;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-xl border border-a-border bg-a-surface", className)} style={order !== undefined ? { order } : undefined}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-a-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-a-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4", className)}>{children}</div>;
}

/** Label/value pairs, e.g. on detail pages. */
export function DetailList({ items, columns = 2 }: { items: [ReactNode, ReactNode][]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
      {items.map(([label, value], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium tracking-wide text-a-muted uppercase">{label}</dt>
          <dd className="mt-0.5 break-words">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────── Buttons as links ───────── */

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-55";
export const buttonVariants = {
  primary: "bg-a-accent text-a-on-accent hover:opacity-90",
  secondary: "border border-a-border bg-a-surface text-a-text hover:bg-a-hover",
  ghost: "text-a-text hover:bg-a-hover",
  danger: "bg-a-danger text-white hover:opacity-90",
  "danger-ghost": "text-a-danger hover:bg-a-danger-soft",
} as const;
export const buttonSizes = { sm: "h-8 px-2.5 text-[13px]", md: "h-9 px-3.5", lg: "h-10 px-4", icon: "size-9", "icon-sm": "size-8" } as const;
export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;
export const buttonClass = (variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) =>
  cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  icon: Icon,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </Link>
  );
}

/** CSV / file download from an API route — a plain link (client-side navigation can't download files). */
export function ExportLink({ entity, label = "Export CSV" }: { entity: string; label?: string }) {
  return (
    <a href={`/api/admin/export/${entity}`} download className={buttonClass("secondary")}>
      <Download className="size-4" aria-hidden /> {label}
    </a>
  );
}

/* ───────── Status ───────── */

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "gold";
const toneClass: Record<Tone, string> = {
  neutral: "bg-a-subtle text-a-muted border-a-border",
  accent: "bg-a-accent-soft text-a-accent border-transparent",
  success: "bg-a-success-soft text-a-success border-transparent",
  warning: "bg-a-warning-soft text-a-warning border-transparent",
  danger: "bg-a-danger-soft text-a-danger border-transparent",
  info: "bg-a-info-soft text-a-info border-transparent",
  gold: "bg-a-gold-soft text-a-gold border-transparent",
};
const toneIcon: Record<Tone, LucideIcon> = {
  neutral: Circle,
  accent: CircleDot,
  success: CheckCircle2,
  warning: Clock,
  danger: XCircle,
  info: Info,
  gold: CircleDashed,
};

/** A status pill: always text + icon, never colour alone. */
export function Badge({
  tone = "neutral",
  children,
  icon,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: LucideIcon | false;
  className?: string;
}) {
  const Icon = icon === false ? null : (icon ?? toneIcon[tone]);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  );
}

export function InternalOnly() {
  return (
    <Badge tone="gold" icon={Lock}>
      Internal only
    </Badge>
  );
}

/* ───────── KPI ───────── */

export function Kpi({
  label,
  value,
  change,
  hint,
  href,
  invert,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  /** Percentage vs the previous period; null when there's no baseline. */
  change?: number | null;
  hint?: ReactNode;
  href?: string;
  /** For metrics where going down is good (e.g. outstanding). */
  invert?: boolean;
  icon?: LucideIcon;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-a-muted">{label}</span>
        {Icon && <Icon className="size-4 text-a-muted" aria-hidden />}
      </div>
      <div className="mt-1.5 font-serif text-[1.75rem] leading-none font-medium">{value}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-a-muted">
        {change !== undefined && <Change value={change} invert={invert} />}
        {hint}
      </div>
    </>
  );
  const cls = "block rounded-xl border border-a-border bg-a-surface p-4";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-a-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Change({ value, invert, suffix = "vs last month" }: { value: number | null; invert?: boolean; suffix?: string }) {
  if (value === null) return <span>New this period</span>;
  const rounded = Math.round(value * 10) / 10;
  const good = invert ? rounded < 0 : rounded > 0;
  const Icon = rounded === 0 ? Minus : rounded > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", rounded === 0 ? "text-a-muted" : good ? "text-a-success" : "text-a-danger")}>
      <Icon className="size-3.5" aria-hidden />
      {Math.abs(rounded)}%<span className="sr-only">{rounded >= 0 ? " increase" : " decrease"}</span>
      <span className="ml-1 font-normal text-a-muted">{suffix}</span>
    </span>
  );
}

/* ───────── Empty / notice ───────── */

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-6" : "px-6 py-12")}>
      {Icon && (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-a-subtle text-a-muted">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-[13px] text-a-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children: ReactNode }) {
  const Icon = tone === "info" ? Info : tone === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div role={tone === "danger" ? "alert" : "note"} className={cn("flex gap-3 rounded-lg px-3.5 py-3 text-[13px]", toneClass[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}

/* ───────── Tables ───────── */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  );
}
export const Th = ({ children, className, ...p }: ComponentProps<"th">) => (
  <th scope="col" className={cn("border-b border-a-border px-3 py-2.5 text-xs font-semibold tracking-wide text-a-muted uppercase", className)} {...p}>
    {children}
  </th>
);
export const Td = ({ children, className, ...p }: ComponentProps<"td">) => (
  <td className={cn("border-b border-a-border px-3 py-2.5 align-middle", className)} {...p}>
    {children}
  </td>
);

/* ───────── Misc ───────── */

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-a-gold-soft font-semibold text-a-gold",
        size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs",
      )}
    >
      {initials}
    </span>
  );
}

export function ProgressBar({ value, max, label, tone = "accent" }: { value: number; max: number; label: string; tone?: "accent" | "warning" | "danger" | "success" }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const bar = { accent: "bg-a-accent", warning: "bg-a-warning", danger: "bg-a-danger", success: "bg-a-success" }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-2 w-full overflow-hidden rounded-full bg-a-subtle">
      <div className={cn("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Money({ value, className, strong }: { value: number; className?: string; strong?: boolean }) {
  return <span className={cn("tabular-nums", strong && "font-semibold", className)}>NPR {new Intl.NumberFormat("en-IN").format(Math.round(value))}</span>;
}

/* ───────── Pagination & tabs (link-based, so they work without JS) ───────── */

type Params = Record<string, string | string[] | undefined>;

export function hrefWith(basePath: string, params: Params, updates: Record<string, string | number | null>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v) next.set(k, v);
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === "") next.delete(k);
    else next.set(k, String(v));
  }
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({ basePath, params, page, pageSize, total }: { basePath: string; params: Params; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total > 0 ? <p className="px-3 py-3 text-xs text-a-muted">{total} {total === 1 ? "record" : "records"}</p> : null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-3 py-3 text-xs text-a-muted">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex gap-1.5">
        {page > 1 ? (
          <Link className={buttonClass("secondary", "sm")} href={hrefWith(basePath, params, { page: page - 1 })} rel="prev">
            Previous
          </Link>
        ) : (
          <span className={buttonClass("secondary", "sm", "pointer-events-none opacity-50")}>Previous</span>
        )}
        <span className="flex items-center px-2">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link className={buttonClass("secondary", "sm")} href={hrefWith(basePath, params, { page: page + 1 })} rel="next">
            Next
          </Link>
        ) : (
          <span className={buttonClass("secondary", "sm", "pointer-events-none opacity-50")}>Next</span>
        )}
      </div>
    </nav>
  );
}

export function Tabs({ items, active, label = "Sections" }: { items: { href: string; label: ReactNode; key: string; count?: number }[]; active: string; label?: string }) {
  return (
    <nav aria-label={label} className="-mx-1 mb-4 overflow-x-auto border-b border-a-border">
      <ul className="flex min-w-max gap-1 px-1">
        {items.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={t.key === active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium",
                t.key === active ? "border-a-accent text-a-text" : "border-transparent text-a-muted hover:text-a-text",
              )}
            >
              {t.label}
              {t.count !== undefined && <span className="rounded-full bg-a-subtle px-1.5 text-[11px] text-a-muted">{t.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Toolbar row above lists: search, filters, actions. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-b border-a-border p-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}
