"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import type { CatalogueSection, EventType, InquiryFormState, InquiryInput } from "@/types";
import { contactMethodOptions } from "@/data/inquiry";
import { buttonClass } from "@/components/ui/ButtonLink";
import CataloguePicker from "@/components/catalogue/CataloguePicker";
import { cn, formatPrice } from "@/lib/utils";
import type { OfferCoupon } from "@/server/offer";
import { readAttribution } from "@/components/site/Attribution";
import { checkDateAvailability, submitInquiry } from "./actions";

export type InquiryFormOptions = { services: string[]; decorationOptions: string[]; guestCounts: string[]; budgets: string[] };

const initialState: InquiryFormState = { status: "idle" };

const chip =
  "flex min-h-11 cursor-pointer items-center rounded-full border border-ink/15 px-4 py-2 text-sm has-[:checked]:border-gold-deep has-[:checked]:bg-gold-light/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold";

const control =
  "mt-2 block h-12 w-full rounded-lg border border-ink/15 bg-white px-4 text-base text-ink transition-colors outline-none placeholder:text-ink/35 focus:border-gold focus:ring-2 focus:ring-gold/25 aria-[invalid=true]:border-red-700";

function Field({
  label,
  name,
  required,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  name: keyof InquiryInput;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {required ? <span className="text-gold-deep"> *</span> : <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export default function InquiryForm({
  eventTypes,
  defaultEventType,
  catalogue,
  defaultDesigns,
  options,
  offer,
}: {
  options: InquiryFormOptions;
  eventTypes: EventType[];
  defaultEventType?: string;
  catalogue: CatalogueSection[];
  /** Catalogue item ids to pre-tick, e.g. from "Enquire" on the catalogue page. */
  defaultDesigns?: string[];
  /** Offer claimed from the homepage popup; sent with the inquiry so the quotation applies it. */
  offer?: OfferCoupon | null;
}) {
  const [state, formAction, pending] = useActionState(submitInquiry, initialState);
  const statusRef = useRef<HTMLDivElement>(null);
  const [otherService, setOtherService] = useState(false);
  const [decoration, setDecoration] = useState(false);
  const [dateHint, setDateHint] = useState<Awaited<ReturnType<typeof checkDateAvailability>>>(null);
  // Only the answer for the latest picked date is shown
  const latestDate = useRef("");
  const { services: inquiryServiceOptions, decorationOptions, guestCounts: guestCountOptions, budgets: budgetOptions } = options;
  const e = state.errors ?? {};
  // Came from "Enquire" on a catalogue design: start the message for them (they can edit it)
  const enquiredAbout = (defaultDesigns ?? []).flatMap((id) => catalogue.flatMap((s) => s.items).filter((i) => i.id === id)).map((i) => `${i.title} (${formatPrice(i.price)})`);
  const designMessage = enquiredAbout.length
    ? `Hi, I'm interested in the ${enquiredAbout.join(", ")} from your catalogue. Could you please share more details and check availability for my date?`
    : undefined;
  const invalid = (name: keyof InquiryInput) =>
    e[name] ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` } : {};

  // Move focus to the result so screen-reader and keyboard users hear it
  useEffect(() => {
    if (state.status !== "idle") statusRef.current?.focus();
  }, [state]);

  if (state.status === "success") {
    return (
      <div ref={statusRef} tabIndex={-1} className="rounded-2xl bg-white p-8 text-center ring-1 ring-ink/10 outline-none md:p-12">
        <CheckCircle2 className="mx-auto size-10 text-gold-deep" strokeWidth={1.25} aria-hidden />
        <h2 className="mt-4 font-serif text-3xl font-medium">Inquiry sent</h2>
        <p className="mx-auto mt-3 max-w-md text-muted">{state.message}</p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      // Submitting through a transition (instead of the form action alone) keeps the visitor's
      // answers in place when validation fails; `action` remains as the no-JavaScript fallback.
      onSubmit={(ev) => {
        ev.preventDefault();
        if (pending) return; // no double submissions
        const data = new FormData(ev.currentTarget);
        // First-touch marketing attribution (UTM, referrer, landing page) captured by <Attribution />
        for (const [k, v] of Object.entries(readAttribution())) data.set(`attr_${k}`, v);
        startTransition(() => formAction(data));
      }}
      className="space-y-6 rounded-2xl bg-white p-6 ring-1 ring-ink/10 md:p-10"
    >
      {state.status === "error" && (
        <div ref={statusRef} tabIndex={-1} role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 outline-none">
          {state.message}
        </div>
      )}

      {offer && (
        <div className="flex items-start gap-3 rounded-lg bg-gold-light/40 px-4 py-3 text-sm ring-1 ring-gold/40">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-gold-deep" strokeWidth={1.5} aria-hidden />
          <p>
            <strong className="font-semibold">Offer applied: {offer.type === "PERCENT" ? `${offer.value}% off` : `Rs ${offer.value.toLocaleString("en-IN")} off`}</strong>
            {offer.spotsLeft != null && ` — ${offer.spotsLeft} of ${offer.spotsTotal} spots left.`} We&apos;ll include it in your quotation. Spots go to the first confirmed bookings.
          </p>
          <input type="hidden" name="offer" value={offer.code} />
        </div>
      )}

      <fieldset className="space-y-5">
        <legend className="font-serif text-2xl font-medium">About you</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name" name="name" required error={e.name}>
            <input id="name" name="name" required autoComplete="name" className={control} {...invalid("name")} />
          </Field>
          <Field label="Phone" name="phone" required error={e.phone}>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              placeholder="98XXXXXXXX"
              className={control}
              {...invalid("phone")}
            />
          </Field>
        </div>
        <Field label="Email" name="email" error={e.email}>
          <input id="email" name="email" type="email" autoComplete="email" className={control} {...invalid("email")} />
        </Field>
        <fieldset aria-describedby={e.preferredContact ? "preferredContact-error" : undefined}>
          <legend className="text-sm font-medium">
            Preferred contact method<span className="text-gold-deep"> *</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {contactMethodOptions.map((m, i) => (
              <label
                key={m.value}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-full border border-ink/15 px-4 text-sm has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-ivory has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold"
              >
                <input type="radio" name="preferredContact" value={m.value} defaultChecked={i === 0} className="sr-only" />
                {m.label}
              </label>
            ))}
          </div>
          {e.preferredContact && (
            <p id="preferredContact-error" className="mt-1.5 text-sm text-red-700">
              {e.preferredContact}
            </p>
          )}
        </fieldset>
      </fieldset>

      <fieldset className="space-y-5 border-t border-ink/10 pt-6">
        <legend className="float-left mb-5 w-full font-serif text-2xl font-medium">Your event</legend>
        <div className="clear-both grid gap-5 sm:grid-cols-2">
          <Field label="Event type" name="eventType" required error={e.eventType}>
            <select
              id="eventType"
              name="eventType"
              required
              defaultValue={defaultEventType ?? ""}
              className={control}
              {...invalid("eventType")}
            >
              <option value="" disabled>
                Select…
              </option>
              {eventTypes.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Event date" name="eventDate" required error={e.eventDate}>
            <input
              id="eventDate"
              name="eventDate"
              type="date"
              required
              className={control}
              {...invalid("eventDate")}
              onChange={(ev) => {
                const date = ev.target.value;
                latestDate.current = date;
                setDateHint(null);
                if (!date) return;
                checkDateAvailability(date)
                  .then((status) => latestDate.current === date && setDateHint(status))
                  .catch(() => {});
              }}
            />
            {dateHint && (
              <p aria-live="polite" className={cn("mt-1.5 text-sm", dateHint === "open" ? "text-emerald-700" : dateHint === "popular" ? "text-amber-700" : "text-burgundy")}>
                {dateHint === "open"
                  ? "Good news — this date looks open."
                  : dateHint === "popular"
                    ? "Popular date — we already have bookings that day, so inquire soon."
                    : "This date is very busy. Send your inquiry and we'll confirm availability quickly."}
              </p>
            )}
          </Field>
          <Field label="Venue / location" name="venue">
            <input id="venue" name="venue" placeholder="e.g. hotel, party palace or home" className={control} />
          </Field>
          <Field label="Expected guests" name="guestCount">
            <select id="guestCount" name="guestCount" defaultValue="" className={control}>
              <option value="">Select…</option>
              {guestCountOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Estimated budget" name="budget" className="sm:col-span-2">
            <select id="budget" name="budget" defaultValue="" className={control}>
              <option value="">Select…</option>
              {budgetOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">
            Services required <span className="font-normal text-muted">(optional)</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {inquiryServiceOptions.map((s) => (
              <label key={s} className={chip}>
                <input
                  type="checkbox"
                  name="servicesRequired"
                  value={s}
                  className="sr-only"
                  aria-expanded={s === "Decoration" ? decoration : undefined}
                  onChange={(ev) => {
                    if (s === "Other") setOtherService(ev.target.checked);
                    if (s === "Decoration") setDecoration(ev.target.checked);
                  }}
                />
                {s}
                {s === "Decoration" && (
                  <ChevronDown className={cn("ml-1.5 size-4 transition-transform", decoration && "rotate-180")} strokeWidth={1.5} aria-hidden />
                )}
              </label>
            ))}
          </div>
          {/* Mounts with every sub-option ticked; unmounted when Decoration is unticked, so none are submitted */}
          {decoration && (
            <fieldset className="mt-3 rounded-xl bg-sand/60 p-4">
              <legend className="sr-only">Which decoration?</legend>
              <p className="text-sm text-muted" aria-hidden>
                Which decoration? Untick anything you don&rsquo;t need.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {decorationOptions.map((s) => (
                  <label key={s} className={cn(chip, "bg-white")}>
                    <input type="checkbox" name="servicesRequired" value={s} defaultChecked className="sr-only" />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {otherService && (
            <div className="mt-3">
              <label htmlFor="servicesOther" className="sr-only">
                Other services
              </label>
              <input
                id="servicesOther"
                name="servicesOther"
                maxLength={200}
                autoFocus
                placeholder="Tell us what else you need — e.g. horse cart, doli, cake, shuttle"
                className={control}
              />
            </div>
          )}
        </fieldset>

        <CataloguePicker sections={catalogue} defaultSelected={defaultDesigns} />
      </fieldset>

      <fieldset className="space-y-5 border-t border-ink/10 pt-6">
        <legend className="float-left mb-5 w-full font-serif text-2xl font-medium">Your vision</legend>
        <Field label="Theme / colour preference" name="theme" className="clear-both">
          <input id="theme" name="theme" placeholder="e.g. ivory and gold, pastel, traditional red" className={control} />
        </Field>
        <Field label="Additional details" name="details">
          <textarea
            id="details"
            name="details"
            rows={5}
            defaultValue={designMessage}
            placeholder="Rituals, timings, anything you already have in mind…"
            className={cn(control, "h-auto py-3")}
          />
        </Field>
        <Field
          label="Inspiration links"
          name="inspirationImages"
          hint="Paste links to Pinterest boards, Instagram posts or photos you love. You can also send images on WhatsApp."
        >
          <textarea id="inspirationImages" name="inspiration" rows={2} className={cn(control, "h-auto py-3")} />
        </Field>
      </fieldset>

      {/* Honeypot for bots */}
      <div className="hidden" aria-hidden>
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="border-t border-ink/10 pt-6">
        <button type="submit" disabled={pending} className={cn(buttonClass("primary", "lg"), "w-full disabled:opacity-60 sm:w-auto")}>
          {pending ? "Sending…" : "Send Inquiry"}
          {!pending && <ArrowRight className="size-4" aria-hidden />}
        </button>
        <p className="mt-4 text-sm text-muted">
          Sending an inquiry doesn&rsquo;t confirm a booking. We&rsquo;ll get in touch to talk through details and send a quote.
        </p>
      </div>
    </form>
  );
}
