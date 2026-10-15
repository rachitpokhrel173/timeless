"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Check, CircleAlert, CircleCheck, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_HINT, passwordChecks } from "@/lib/auth/password-rules";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { acceptInvitation, type InvitationState } from "./actions";

const inputClass = "h-10 w-full rounded-md border border-a-border bg-a-surface px-3 pr-11 outline-none focus:border-a-accent focus-visible:outline-none";
const cardClass = "space-y-4 rounded-xl border border-a-border bg-a-surface p-6 shadow-sm";

type LinkCheck = "idle" | "checking" | "expired" | "invalid";

/**
 * Reads a session that Supabase put in the URL fragment (#access_token=…). That is what the
 * default "Accept invitation" email ({{ .ConfirmationURL }}) produces: Supabase verifies the
 * token on its own domain, then redirects here with the session in the fragment, which never
 * reaches the server. The fragment is removed from the address bar straight away.
 */
async function sessionFromFragment(): Promise<{ result: LinkCheck | "session" | "recovery" | "none" }> {
  if (typeof window === "undefined" || window.location.hash.length < 2) return { result: "none" };
  const params = new URLSearchParams(window.location.hash.slice(1));
  window.history.replaceState(window.history.state, "", window.location.pathname);

  const errorCode = params.get("error_code") ?? params.get("error");
  if (errorCode) return { result: errorCode === "otp_expired" ? "expired" : "invalid" };
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return { result: "none" };

  // A one-off client: the shared one uses the PKCE flow and would reject these tokens
  const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    isSingleton: false,
    auth: { detectSessionInUrl: false, autoRefreshToken: false },
  });
  // setSession checks the access token with the Auth server before storing the session cookie
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) return { result: "invalid" };
  return { result: params.get("type") === "recovery" ? "recovery" : "session" };
}

function PasswordField({ id, label, value, onChange, describedBy }: { id: string; label: string; value: string; onChange: (v: string) => void; describedBy?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={shown ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-a-muted hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent"
        >
          {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

function LinkProblem({ kind, message }: { kind: "expired" | "invalid"; message?: string }) {
  return (
    <div className={cardClass} role="alert">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-a-danger" aria-hidden />
        <div className="space-y-1.5">
          <p className="font-medium">{kind === "expired" ? "This invitation link has expired" : "This invitation link isn't valid"}</p>
          <p className="text-sm text-a-muted">
            {message ??
              (kind === "expired"
                ? "Invitation links work once and only for a limited time. Ask an administrator to send you a new invitation."
                : "The link may have been used already or copied incompletely. Open the most recent invitation email, or ask an administrator to send a new one.")}
          </p>
        </div>
      </div>
      <p className="text-sm text-a-muted">
        Already set your password?{" "}
        <Link href="/admin/login" className="font-medium text-a-text underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function AcceptInvitationForm({ tokenHash, email, hasSession }: { tokenHash?: string; email?: string; hasSession: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<InvitationState, FormData>(acceptInvitation, {});
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [link, setLink] = useState<LinkCheck>(tokenHash || hasSession ? "idle" : "checking");

  // Links that carry the session in the URL fragment (see sessionFromFragment)
  useEffect(() => {
    if (tokenHash || hasSession) {
      // Session already known: just keep tokens out of the address bar and history
      if (/[#&](access_token|refresh_token)=/.test(window.location.hash)) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      return;
    }
    let cancelled = false;
    sessionFromFragment().then(
      ({ result }) => {
        if (cancelled) return;
        if (result === "recovery") router.replace("/admin/reset-password");
        else if (result === "session") router.refresh(); // the server now sees the session and passes the email
        else setLink(result === "none" ? "invalid" : result);
      },
      () => !cancelled && setLink("invalid"),
    );
    return () => {
      cancelled = true;
    };
  }, [tokenHash, hasSession, router]);

  useEffect(() => {
    if (state.status !== "done" || !state.redirectTo) return;
    const timer = setTimeout(() => router.replace(state.redirectTo!), 2500);
    return () => clearTimeout(timer);
  }, [state.status, state.redirectTo, router]);

  if (state.status === "done") {
    return (
      <div className={cardClass} role="status">
        <div className="flex items-start gap-3">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-a-success" aria-hidden />
          <div className="space-y-1.5">
            <p className="font-medium">Your password is set</p>
            <p className="text-sm text-a-muted">
              From now on, sign in with {state.email ? <strong className="text-a-text">{state.email}</strong> : "your email"} and this password. Taking you to the dashboard…
            </p>
          </div>
        </div>
        <Link
          href={state.redirectTo ?? "/admin"}
          className="flex h-10 w-full items-center justify-center rounded-md bg-a-accent font-medium text-a-on-accent hover:opacity-90"
        >
          Continue to dashboard
        </Link>
      </div>
    );
  }
  if (state.status === "expired" || state.status === "invalid") return <LinkProblem kind={state.status} message={state.error} />;
  if (link === "expired" || link === "invalid") return <LinkProblem kind={link} />;
  // Still reading the URL fragment — until the refreshed page reports the session it created
  if (link === "checking" && !hasSession) {
    return (
      <div className={`${cardClass} flex items-center justify-center gap-2 text-a-muted`} role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Verifying your invitation…
      </div>
    );
  }

  const checks = passwordChecks(password);
  const meetsPolicy = checks.every((c) => c.optional || c.ok);
  const mismatch = confirm.length > 0 && confirm !== password;
  const shownEmail = state.email ?? email;

  return (
    <form action={action} className={cardClass} noValidate={false}>
      {tokenHash && !state.verified && <input type="hidden" name="token_hash" value={tokenHash} />}
      {shownEmail && (
        <p className="rounded-md bg-a-bg px-3 py-2 text-sm">
          Account: <strong>{shownEmail}</strong>
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-md bg-a-danger-soft px-3 py-2 text-sm text-a-danger">
          {state.error}
        </p>
      )}
      <PasswordField id="password" label="New password" value={password} onChange={setPassword} describedBy="pw-rules" />
      <ul id="pw-rules" className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2" aria-label={PASSWORD_HINT}>
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-1.5 ${c.ok ? "text-a-success" : "text-a-muted"}`}>
            <Check className={`size-3.5 ${c.ok ? "opacity-100" : "opacity-30"}`} aria-hidden />
            {c.label}
            <span className="sr-only">{c.ok ? " — done" : " — not yet"}</span>
          </li>
        ))}
      </ul>
      <div>
        <PasswordField id="confirm" label="Confirm password" value={confirm} onChange={setConfirm} describedBy={mismatch ? "confirm-error" : undefined} />
        {mismatch && (
          <p id="confirm-error" className="mt-1.5 text-xs text-a-danger">
            The passwords don&rsquo;t match yet.
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending || !meetsPolicy || confirm !== password}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-a-accent font-medium text-a-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {pending ? "Saving your password…" : "Set password & continue"}
      </button>
      <p className="text-center text-xs text-a-muted">You won&rsquo;t be asked for an old password — this link proves the invitation is yours.</p>
    </form>
  );
}
