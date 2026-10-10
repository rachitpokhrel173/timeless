"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { respondToQuote } from "./actions";

type Mode = "ACCEPTED" | "CHANGES_REQUESTED" | "REJECTED";

const field = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-[15px] outline-none focus:border-[#5a1f2b] focus-visible:ring-2 focus-visible:ring-[#5a1f2b]/30";

export default function QuoteResponse({ token, deposit }: { token: string; deposit: string | null }) {
  const [mode, setMode] = useState<Mode>("ACCEPTED");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Mode | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (done)
    return (
      <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="size-5" aria-hidden />
          {done === "ACCEPTED" ? "Thank you — your quotation is accepted." : done === "REJECTED" ? "Thank you for letting us know." : "Thanks — we've received your request."}
        </p>
        <p className="mt-1 text-sm">
          {done === "ACCEPTED" ? `We'll be in touch shortly${deposit ? ` about the ${deposit} advance` : ""} to confirm your date.` : "Our team will get back to you soon."}
        </p>
      </div>
    );

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          let r;
          try {
            r = await respondToQuote({ token, action: mode, name: String(f.get("name") ?? ""), message: String(f.get("message") ?? ""), agree: f.get("agree") === "on" });
          } catch {
            r = { ok: false as const, error: "Couldn't reach us — check your connection and try again." };
          }
          if (r.ok) {
            setDone(mode);
            // Re-render the document with the client's acceptance signature
            if (mode === "ACCEPTED") router.refresh();
          }
          else {
            setErrors(("fieldErrors" in r && r.fieldErrors) || {});
            setError(r.error);
          }
        });
      }}
    >
      <fieldset className="flex flex-wrap gap-2" aria-label="Your response">
        {(
          [
            ["ACCEPTED", "Accept quotation"],
            ["CHANGES_REQUESTED", "Request changes"],
            ["REJECTED", "Decline"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium ${mode === value ? "border-[#5a1f2b] bg-[#5a1f2b] text-white" : "border-neutral-300 bg-white hover:border-neutral-400"}`}>
            <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
            {label}
          </label>
        ))}
      </fieldset>

      {mode === "ACCEPTED" && (
        <div>
          <label htmlFor="q-name" className="mb-1 block text-sm font-medium">
            Your full name
          </label>
          <input id="q-name" name="name" autoComplete="name" className={field} aria-invalid={!!errors.name} aria-describedby={errors.name ? "q-name-err" : undefined} />
          {errors.name && (
            <p id="q-name-err" className="mt-1 text-sm text-red-700">
              {errors.name}
            </p>
          )}
        </div>
      )}
      <div>
        <label htmlFor="q-msg" className="mb-1 block text-sm font-medium">
          {mode === "ACCEPTED" ? "Message (optional)" : mode === "REJECTED" ? "Could you tell us why?" : "What would you like changed?"}
        </label>
        <textarea id="q-msg" name="message" rows={3} className={field} aria-invalid={!!errors.message} aria-describedby={errors.message ? "q-msg-err" : undefined} />
        {errors.message && (
          <p id="q-msg-err" className="mt-1 text-sm text-red-700">
            {errors.message}
          </p>
        )}
      </div>
      {mode === "ACCEPTED" && (
        <div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="agree" className="mt-1 size-4 accent-[#5a1f2b]" aria-invalid={!!errors.agree} />
            <span>I have read and agree to the terms & conditions in this quotation.</span>
          </label>
          {errors.agree && <p className="mt-1 text-sm text-red-700">{errors.agree}</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-md bg-[#5a1f2b] px-5 font-medium text-white hover:opacity-90 disabled:opacity-60">
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {mode === "ACCEPTED" ? "Accept quotation" : mode === "REJECTED" ? "Send" : "Send request"}
      </button>
    </form>
  );
}
