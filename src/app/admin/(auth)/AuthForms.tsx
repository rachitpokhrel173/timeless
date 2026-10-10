"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { login, requestPasswordReset, setNewPassword, type AuthFormState } from "./login/actions";

const inputClass = "h-10 w-full rounded-md border border-a-border bg-a-surface px-3 outline-none focus:border-a-accent focus-visible:outline-none";
const cardClass = "space-y-4 rounded-xl border border-a-border bg-a-surface p-6 shadow-sm";

function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-a-accent font-medium text-a-on-accent hover:opacity-90 disabled:opacity-60"
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {pending ? busy : idle}
    </button>
  );
}

function Status({ state }: { state: AuthFormState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-md bg-a-danger-soft px-3 py-2 text-sm text-a-danger">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="rounded-md bg-a-success-soft px-3 py-2 text-sm text-a-success">
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
        <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Link href="/admin/forgot-password" className="text-xs text-a-muted underline-offset-2 hover:text-a-text hover:underline">
            Forgot password?
          </Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
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
            <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} className={inputClass} />
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
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className={inputClass} aria-describedby="pw-hint" />
        <p id="pw-hint" className="text-xs text-a-muted">
          At least 10 characters, with letters and a number.
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">
          Confirm password
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
      </div>
      <Submit pending={pending} idle="Save password" busy="Saving…" />
    </form>
  );
}
