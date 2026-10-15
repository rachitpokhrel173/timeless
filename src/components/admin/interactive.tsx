"use client";

/*
 * Interactive admin primitives: toasts, buttons with pending state, accessible dialogs,
 * confirmations, forms wired to server actions, URL-driven search/filters and bulk selection.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { CheckCircle2, ChevronDown, LoaderCircle, Search, X, XCircle, type LucideIcon } from "lucide-react";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./ui";

/* ───────── Toasts ───────── */

type Toast = { id: number; tone: "success" | "error"; message: string };
const ToastContext = createContext<(tone: Toast["tone"], message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 md:items-end md:pr-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] shadow-lg",
              t.tone === "success" ? "border-a-border bg-a-surface text-a-text" : "border-transparent bg-a-danger text-white",
            )}
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-a-success" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
              className="ml-1 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/**
 * Run a server action with a pending state, toast feedback and a data refresh.
 * Returns the result so callers can react to it (close a dialog, navigate…).
 */
export function useRun() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = useCallback(
    <T,>(
      call: () => Promise<ActionResult<T>>,
      opts: { success?: string | ((data: T) => string); refresh?: boolean; onSuccess?: (data: T) => void; onError?: (r: Extract<ActionResult<T>, { ok: false }>) => void } = {},
    ) =>
      new Promise<ActionResult<T>>((resolve) => {
        start(async () => {
          let result: ActionResult<T>;
          try {
            result = await call();
          } catch {
            result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
          }
          if (result.ok) {
            const msg = typeof opts.success === "function" ? opts.success(result.data) : (opts.success ?? result.message);
            if (msg) toast("success", msg);
            opts.onSuccess?.(result.data);
            if (opts.refresh !== false) router.refresh();
          } else {
            if (!result.fieldErrors || Object.keys(result.fieldErrors).length === 0 || !opts.onError) toast("error", result.error);
            opts.onError?.(result);
          }
          resolve(result);
        });
      }),
    [router, toast],
  );
  return { run, pending };
}

/* ───────── Buttons ───────── */

/** A lucide icon component, or an icon element — server components must pass elements (<Archive />). */
export type IconProp = LucideIcon | ReactElement<{ className?: string }>;

function renderIcon(icon: IconProp) {
  if (isValidElement(icon)) return cloneElement(icon, { className: cn("size-4", icon.props.className), "aria-hidden": true } as { className: string });
  const Icon = icon;
  return <Icon className="size-4" aria-hidden />;
}

export function Button({
  variant = "secondary",
  size = "md",
  pending,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; pending?: boolean; icon?: IconProp }) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || pending} aria-busy={pending || undefined} {...props}>
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon && renderIcon(icon)}
      {children}
    </button>
  );
}

/** A button that runs a server action directly. */
export function ActionButton<T>({
  action,
  success,
  children,
  onDone,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "action"> & {
  action: () => Promise<ActionResult<T>>;
  success?: string;
  onDone?: (data: T) => void;
}) {
  const { run, pending } = useRun();
  return (
    <Button {...props} pending={pending} onClick={() => run(action, { success, onSuccess: onDone })}>
      {children}
    </Button>
  );
}

/* ───────── Dialog ───────── */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "admin-dialog m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] overflow-hidden rounded-xl border border-a-border bg-a-surface p-0 text-a-text shadow-2xl backdrop:bg-black/40",
        { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size],
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-a-border px-5 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-[13px] text-a-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="-mr-1 rounded p-1 text-a-muted hover:bg-a-hover hover:text-a-text" aria-label="Close">
              <X className="size-4" />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-a-border bg-a-subtle/50 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** A trigger button plus a dialog it opens. The render prop receives `close`. */
export function DialogButton({
  label,
  icon,
  variant = "secondary",
  size = "md",
  title,
  description,
  dialogSize,
  children,
  className,
}: {
  label: ReactNode;
  icon?: IconProp;
  variant?: ButtonVariant;
  size?: ButtonSize;
  title: ReactNode;
  description?: ReactNode;
  dialogSize?: "sm" | "md" | "lg" | "xl";
  children: (close: () => void) => ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Button variant={variant} size={size} icon={icon} onClick={() => setOpen(true)} className={className}>
        {label}
      </Button>
      <Dialog open={open} onClose={close} title={title} description={description} size={dialogSize}>
        {open && children(close)}
      </Dialog>
    </>
  );
}

/** Asks before running a destructive or important action. */
export function ConfirmButton<T>({
  action,
  title,
  body,
  confirmLabel = "Confirm",
  success,
  variant = "danger-ghost",
  confirmVariant = "danger",
  size = "md",
  icon,
  children,
  onDone,
  disabled,
  className,
  requireText,
}: {
  action: () => Promise<ActionResult<T>>;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  success?: string;
  variant?: ButtonVariant;
  confirmVariant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconProp;
  children: ReactNode;
  onDone?: (data: T) => void;
  disabled?: boolean;
  className?: string;
  /** Type-to-confirm for irreversible actions. */
  requireText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const { run, pending } = useRun();
  return (
    <>
      <Button variant={variant} size={size} icon={icon} onClick={() => setOpen(true)} disabled={disabled} className={className}>
        {children}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        size="sm"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant={confirmVariant}
              pending={pending}
              disabled={!!requireText && typed !== requireText}
              onClick={() =>
                run(action, {
                  success,
                  onSuccess: (d) => {
                    setOpen(false);
                    onDone?.(d);
                  },
                })
              }
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px] text-a-muted">
          {body}
          {requireText && (
            <label className="block">
              Type <strong className="text-a-text">{requireText}</strong> to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} className={cn(inputClass, "mt-1")} />
            </label>
          )}
        </div>
      </Dialog>
    </>
  );
}

/* ───────── Forms ───────── */

export const inputClass =
  "h-9 w-full rounded-md border border-a-border bg-a-surface px-3 text-[14px] text-a-text placeholder:text-a-muted/70 outline-none focus:border-a-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-a-accent aria-[invalid=true]:border-a-danger disabled:bg-a-subtle";

const FormErrors = createContext<Record<string, string>>({});

/** Converts the form's fields to a plain object: repeated names and names ending in [] become arrays. */
export function formToObject(form: HTMLFormElement) {
  const data = new FormData(form);
  const out: Record<string, unknown> = {};
  for (const key of new Set(data.keys())) {
    const values = data.getAll(key).filter((v): v is string => typeof v === "string");
    if (key.endsWith("[]")) out[key.slice(0, -2)] = values;
    else out[key] = values.length > 1 ? values : values[0];
  }
  // Unchecked checkboxes aren't submitted — report them as false
  form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-bool]').forEach((cb) => {
    if (!cb.name.endsWith("[]")) out[cb.name] = cb.checked;
  });
  form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-array]").forEach((el) => {
    if (!(el.name.replace(/\[\]$/, "") in out)) out[el.name.replace(/\[\]$/, "")] = [];
  });
  return out;
}

/**
 * A form posting to an admin server action. Fields are plain uncontrolled inputs; validation
 * errors from the server appear under the matching field.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = (input: never) => Promise<ActionResult<any>>;

export function ActionForm<T = unknown>({
  action,
  children,
  submitLabel = "Save",
  success = "Saved",
  onSuccess,
  onCancel,
  extra,
  className,
  footerClassName,
  resetOnSuccess,
  hideFooter,
  submitIcon,
}: {
  action: AnyAction;
  children: ReactNode;
  submitLabel?: string;
  success?: string | ((data: T) => string) | false;
  onSuccess?: (data: T) => void;
  onCancel?: () => void;
  /** Extra values merged into the submitted object (ids, etc.). */
  extra?: Record<string, unknown>;
  className?: string;
  footerClassName?: string;
  resetOnSuccess?: boolean;
  hideFooter?: boolean;
  submitIcon?: IconProp;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { run, pending } = useRun();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = { ...formToObject(form), ...extra };
    setFormError(null);
    run(() => (action as (i: unknown) => Promise<ActionResult<T>>)(input), {
      success: success === false ? undefined : success,
      onSuccess: (data) => {
        setErrors({});
        if (resetOnSuccess) form.reset();
        onSuccess?.(data);
      },
      onError: (r) => {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.error);
        // Move focus to the first invalid field
        const first = r.fieldErrors && Object.keys(r.fieldErrors)[0];
        if (first) form.querySelector<HTMLElement>(`[name="${first}"],[name="${first}[]"]`)?.focus();
      },
    });
  }

  return (
    <FormErrors.Provider value={errors}>
      <form onSubmit={onSubmit} className={cn("space-y-4", className)} noValidate>
        {formError && Object.keys(errors).length > 0 && (
          <p role="alert" className="rounded-md bg-a-danger-soft px-3 py-2 text-[13px] text-a-danger">
            {formError}
          </p>
        )}
        {children}
        {!hideFooter && (
          <div className={cn("flex flex-wrap justify-end gap-2 pt-1", footerClassName)}>
            {onCancel && <Button onClick={onCancel}>Cancel</Button>}
            <Button type="submit" variant="primary" pending={pending} icon={submitIcon}>
              {submitLabel}
            </Button>
          </div>
        )}
      </form>
    </FormErrors.Provider>
  );
}

export function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button type="submit" variant="primary" {...props}>
      {children}
    </Button>
  );
}

export function Field({
  label,
  name,
  hint,
  children,
  className,
  required,
}: {
  label: ReactNode;
  name?: string;
  hint?: ReactNode;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
  className?: string;
  required?: boolean;
}) {
  const id = useId();
  const errors = useContext(FormErrors);
  const error = name ? errors[name] : undefined;
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[13px] font-medium">
        {label}
        {required && (
          <span className="text-a-danger" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-a-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-xs font-medium text-a-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<ComponentProps<"input">, "name"> & { label: ReactNode; name: string; hint?: ReactNode; wrapClassName?: string };

export function TextField({ label, name, hint, wrapClassName, required, className, ...props }: InputProps) {
  return (
    <Field label={label} name={name} hint={hint} className={wrapClassName} required={required}>
      {(a) => <input name={name} className={cn(inputClass, className)} required={required} {...a} {...props} />}
    </Field>
  );
}

export function TextArea({
  label,
  name,
  hint,
  wrapClassName,
  required,
  rows = 3,
  ...props
}: Omit<ComponentProps<"textarea">, "name"> & { label: ReactNode; name: string; hint?: ReactNode; wrapClassName?: string }) {
  return (
    <Field label={label} name={name} hint={hint} className={wrapClassName} required={required}>
      {(a) => <textarea name={name} rows={rows} className={cn(inputClass, "h-auto py-2 leading-relaxed")} required={required} {...a} {...props} />}
    </Field>
  );
}

export type Option = { value: string; label: string };

export function SelectField({
  label,
  name,
  hint,
  options,
  placeholder,
  wrapClassName,
  required,
  ...props
}: Omit<ComponentProps<"select">, "name"> & {
  label: ReactNode;
  name: string;
  hint?: ReactNode;
  options: Option[];
  placeholder?: string;
  wrapClassName?: string;
}) {
  return (
    <Field label={label} name={name} hint={hint} className={wrapClassName} required={required}>
      {(a) => (
        <select name={name} className={cn(inputClass, "pr-8")} required={required} {...a} {...props}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function CheckboxField({
  label,
  name,
  hint,
  defaultChecked,
  className,
  ...props
}: Omit<ComponentProps<"input">, "name" | "type"> & { label: ReactNode; name: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input id={id} type="checkbox" name={name} data-bool defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-[var(--a-accent)]" {...props} />
      <label htmlFor={id} className="text-[13px] leading-snug">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-a-muted">{hint}</span>}
      </label>
    </div>
  );
}

/** Group of checkboxes submitted as an array. */
export function CheckboxGroup({ label, name, options, defaultValue = [] }: { label: ReactNode; name: string; options: Option[]; defaultValue?: string[] }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[13px] font-medium">{label}</legend>
      <input type="hidden" name={`${name}[]`} data-array value="" disabled />
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" name={`${name}[]`} value={o.value} defaultChecked={defaultValue.includes(o.value)} className="size-4 accent-[var(--a-accent)]" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ───────── URL-driven list controls ───────── */

function useSetParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in updates)) next.delete("page");
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
    },
    [params, pathname, router],
  );
  return { set, params, pending };
}

/** Debounced search box bound to ?q= */
export function SearchBox({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { set, params, pending } = useSetParams();
  const [value, setValue] = useState(params.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-a-muted" aria-hidden />
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => set({ [param]: v.trim() || null }), 300);
        }}
        className={cn(inputClass, "pl-8")}
      />
      {pending && <LoaderCircle className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-a-muted" aria-hidden />}
    </div>
  );
}

/** A select bound to a URL param (filters). */
export function FilterSelect({ param, options, label, allLabel = "All" }: { param: string; options: Option[]; label: string; allLabel?: string }) {
  const { set, params } = useSetParams();
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={params.get(param) ?? ""}
        onChange={(e) => set({ [param]: e.target.value || null })}
        className={cn(inputClass, "w-auto appearance-none pr-8")}
      >
        <option value="">
          {label}: {allLabel}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {label}: {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-a-muted" aria-hidden />
    </div>
  );
}

export function DateRangeFilter() {
  const { set, params } = useSetParams();
  return (
    <div className="flex items-center gap-1.5">
      <input type="date" aria-label="From date" value={params.get("from") ?? ""} onChange={(e) => set({ from: e.target.value || null, range: null })} className={cn(inputClass, "w-auto")} />
      <span className="text-a-muted">–</span>
      <input type="date" aria-label="To date" value={params.get("to") ?? ""} onChange={(e) => set({ to: e.target.value || null, range: null })} className={cn(inputClass, "w-auto")} />
    </div>
  );
}

/* ───────── Bulk selection ───────── */

export type BulkAction = {
  label: string;
  icon?: IconProp;
  variant?: ButtonVariant;
  /** Server action receiving the selected ids. */
  action: (ids: string[]) => Promise<ActionResult<unknown>>;
  confirm?: string;
  success?: string;
};

export type BulkRow = { id: string; cells: ReactNode[]; className?: string };

/**
 * A table with row selection and a bulk-action bar. Cells are rendered on the server and passed in.
 */
export function BulkTable({
  columns,
  rows,
  actions,
  empty,
  minWidth = 720,
}: {
  columns: { label: ReactNode; className?: string }[];
  rows: BulkRow[];
  actions: BulkAction[];
  empty?: ReactNode;
  minWidth?: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<BulkAction | null>(null);
  const { run, pending } = useRun();
  const allIds = rows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  // Drop selections that disappeared after a refresh
  const rowKey = allIds.join(",");
  const [selectionRows, setSelectionRows] = useState(rowKey);
  if (selectionRows !== rowKey) {
    setSelectionRows(rowKey);
    setSelected((prev) => new Set([...prev].filter((id) => allIds.includes(id))));
  }

  const exec = (a: BulkAction) =>
    run(() => a.action([...selected]), {
      success: a.success ?? "Done",
      onSuccess: () => {
        setSelected(new Set());
        setConfirming(null);
      },
    });

  if (rows.length === 0) return <>{empty}</>;

  return (
    <div>
      {selected.size > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-a-border bg-a-accent-soft px-3 py-2 text-[13px]" role="toolbar" aria-label="Bulk actions">
          <span className="mr-2 font-medium">{selected.size} selected</span>
          {actions.map((a) => (
            <Button key={a.label} size="sm" variant={a.variant ?? "secondary"} icon={a.icon} pending={pending && confirming === a} onClick={() => (a.confirm ? setConfirming(a) : exec(a))}>
              {a.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]" style={{ minWidth }}>
          <thead>
            <tr>
              <th scope="col" className="w-10 border-b border-a-border px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))}
                  className="size-4 accent-[var(--a-accent)]"
                />
              </th>
              {columns.map((c, i) => (
                <th key={i} scope="col" className={cn("border-b border-a-border px-3 py-2.5 text-xs font-semibold tracking-wide text-a-muted uppercase", c.className)}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn("hover:bg-a-subtle/60", selected.has(r.id) && "bg-a-accent-soft/50", r.className)}>
                <td className="border-b border-a-border px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select row"
                    checked={selected.has(r.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                    className="size-4 accent-[var(--a-accent)]"
                  />
                </td>
                {r.cells.map((cell, i) => (
                  <td key={i} className={cn("border-b border-a-border px-3 py-2.5 align-middle", columns[i]?.className)}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={confirming?.label ?? ""}
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Cancel</Button>
            <Button variant={confirming?.variant === "danger" ? "danger" : "primary"} pending={pending} onClick={() => confirming && exec(confirming)}>
              {confirming?.label} {selected.size} {selected.size === 1 ? "item" : "items"}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-a-muted">{confirming?.confirm}</p>
      </Dialog>
    </div>
  );
}

/* ───────── Small menu ───────── */

export function Menu({ label, icon, items, heading, align = "right", variant = "ghost", size = "icon-sm" }: {
  label: string;
  icon: IconProp;
  items: ({ label: string; icon?: IconProp; onSelect: () => void; danger?: boolean } | { href: string; label: string; icon?: IconProp })[];
  /** Small note at the top of the menu */
  heading?: ReactNode;
  align?: "left" | "right";
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button variant={variant} size={size} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {renderIcon(icon)}
        {!size.startsWith("icon") && label}
      </Button>
      {open && (
        <div role="menu" className={cn("absolute z-30 mt-1 min-w-44 rounded-lg border border-a-border bg-a-surface p-1 shadow-lg", align === "right" ? "right-0" : "left-0")}>
          {heading && <p className="px-2.5 pt-1.5 pb-1 text-xs text-a-muted">{heading}</p>}
          {items.map((item, i) => {
            const danger = "danger" in item && item.danger;
            const prev = items[i - 1];
            return (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  if ("href" in item) router.push(item.href);
                  else item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-a-hover",
                  danger && "text-a-danger",
                  // Separate destructive items from the rest
                  danger && prev && !("danger" in prev && prev.danger) && "mt-1 border-t border-a-border pt-2",
                )}
              >
                {item.icon && renderIcon(item.icon)}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
