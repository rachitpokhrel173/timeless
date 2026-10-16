"use client";

import Link from "next/link";
import { useActionState, useState, type ComponentProps, type ComponentType } from "react";
import { ArrowRight, CircleAlert, CircleCheck, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_HINT } from "@/lib/auth/password-rules";
import { login, requestPasswordReset, setNewPassword, type AuthFormState } from "./login/actions";

const inputClass =
  "h-11 w-full rounded-lg border border-a-border bg-a-surface pl-10 outline-none transition-colors placeholder:text-a-muted/60 focus:border-a-accent focus:ring-3 focus:ring-a-accent/15 focus-visible:outline-none";
const cardClass = "space-y-5 rounded-2xl border border-a-border bg-a-surface p-7 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-12px_rgb(0_0_0/0.12)]";

/** Text input with a leading icon; password fields get a show/hide toggle. */
function Field({ icon: Icon, type, ...props }: ComponentProps<"input"> & { icon: ComponentType<{ className?: string }> }) {
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-a-muted" aria-hidden />
      <input type={isPassword && shown ? "text" : type} className={`${inputClass} ${isPassword ? "pr-11" : "pr-3.5"}`} {...props} />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-a-muted hover:bg-a-hover hover:text-a-text"
        >
          {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      )}
    </div>
  );
}

function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-a-accent font-semibold text-a-on-accent shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {pending ? busy : idle}
      {!pending && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />}
    </button>
  );
}

function Status({ state }: { state: AuthFormState }) {
  if (state.error)
    return (
      <p role="alert" className="flex gap-2 rounded-lg bg-a-danger-soft px-3 py-2.5 text-sm text-a-danger">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="flex gap-2 rounded-lg bg-a-success-soft px-3 py-2.5 text-sm text-a-success">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  return null;
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(login, notice ? { error: notice } : {});
  return (
    <form action={action} className={cardClass}>
      {next && <input type="hidden" name="next" value={next} />}
      <Status state={state} />
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Field icon={Mail} id="email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required defaultValue={state.email} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Link href="/admin/forgot-password" className="text-xs font-medium text-a-accent underline-offset-2 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Field icon={LockKeyhole} id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
      </div>
      <Submit pending={pending} idle="Sign in" busy="Signing in…" />
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className={cardClass}>
      <Status state={state} />
      {!state.message && (
        <>
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Field icon={Mail} id="email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required defaultValue={state.email} />
          </div>
          <Submit pending={pending} idle="Send reset link" busy="Sending…" />
        </>
      )}
      <p className="text-center text-sm">
        <Link href="/admin/login" className="text-a-muted hover:text-a-text">
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(setNewPassword, {});
  return (
    <form action={action} className={cardClass}>
      <Status state={state} />
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          New password
        </label>
        <Field icon={LockKeyhole} id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH} aria-describedby="pw-hint" />
        <p id="pw-hint" className="text-xs text-a-muted">
          {PASSWORD_HINT}
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">
          Confirm password
        </label>
        <Field icon={LockKeyhole} id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <Submit pending={pending} idle="Save password" busy="Saving…" />
    </form>
  );
}
