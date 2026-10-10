"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import type { HomeOffer } from "@/types";
import { INQUIRY_PATH } from "@/data/site";
import Botanical from "@/components/brand/Botanical";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { buttonClass } from "@/components/ui/ButtonLink";
import Rich from "@/components/ui/Rich";
import { useSite } from "@/components/site/SiteContext";
import { cn, showPlaceholders, whatsappHref } from "@/lib/utils";

/** Wait this long after the page loads before showing the offer. */
const DELAY_MS = 4000;
/** Once closed, stay hidden for this long. */
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

const storageKey = (id: string) => `offer-dismissed:${id}`;

function wasDismissed(id: string) {
  try {
    const at = Number(localStorage.getItem(storageKey(id)));
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

function rememberDismissed(id: string) {
  try {
    localStorage.setItem(storageKey(id), String(Date.now()));
  } catch {
    // Private mode or blocked storage: the popup may simply show again next visit
  }
}

/**
 * Homepage offer, shown once a few seconds after load. Built on <dialog>, so the browser handles
 * focus trapping, Escape and inerting the page. Placeholder offers never reach the live site.
 */
export default function OfferPopup({ offer }: { offer: HomeOffer }) {
  const site = useSite();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const active = offer.enabled && (showPlaceholders || !offer.placeholder);

  useEffect(() => {
    if (!active || wasDismissed(offer.id)) return;
    const t = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(t);
  }, [active, offer.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      if (dialog.open) dialog.close();
    };
  }, [open]);

  if (!active) return null;

  const close = () => {
    rememberDismissed(offer.id);
    setOpen(false);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="offer-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      // A click on the backdrop lands on the <dialog> itself
      onClick={(e) => e.target === e.currentTarget && close()}
      className="offer m-auto max-h-[94dvh] w-[min(94vw,52rem)] overflow-y-auto rounded-[14px] bg-ivory p-0 text-ink shadow-[0_50px_100px_-30px_rgb(0_0_0/0.65)]"
    >
      <div className="grid sm:grid-cols-[0.95fr_1.05fr]">
        {/* Photo with the deal sealed on it */}
        <div className="relative isolate aspect-[16/10] overflow-hidden bg-forest-deep sm:aspect-auto sm:min-h-[30rem]">
          <Image
            src={offer.image.src}
            alt={offer.image.alt}
            fill
            sizes="(min-width: 640px) 400px, 94vw"
            className="offer__photo -z-20 object-cover"
            style={{ objectPosition: offer.image.focus }}
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-deep/80 via-forest-deep/10 to-forest-deep/20" aria-hidden />
          {/* Fine gold frame inside the photo */}
          <div className="absolute inset-3 rounded-[8px] border border-gold-light/50 sm:inset-4" aria-hidden />

          {offer.highlight && (
            <div className="offer__seal absolute right-5 bottom-5 flex size-28 flex-col items-center justify-center rounded-full bg-peach text-center text-ink shadow-[0_18px_40px_-16px_rgb(0_0_0/0.6)] ring-1 ring-peach ring-offset-4 ring-offset-transparent outline outline-1 outline-offset-[6px] outline-peach/70 sm:right-7 sm:bottom-7 sm:size-32">
              <span className="font-serif text-[2.4rem] leading-none font-medium sm:text-[2.8rem]">{offer.highlight}</span>
              {offer.highlightNote && <span className="mt-1 text-[0.62rem] font-semibold tracking-[0.18em] uppercase">{offer.highlightNote}</span>}
            </div>
          )}

          <p className="absolute bottom-6 left-6 hidden max-w-[11rem] font-serif text-[1.15rem] leading-snug text-ivory italic sm:block">
            Celebrations, beautifully designed.
          </p>
        </div>

        <div className="relative overflow-hidden px-7 pt-9 pb-8 sm:px-10 sm:pt-12 sm:pb-10">
          <Botanical variant="sprig" className="absolute -top-3 -right-4 h-32 w-auto rotate-[200deg] text-gold/45" strokeWidth={1.2} />

          <button
            type="button"
            onClick={close}
            aria-label="Close offer"
            className="absolute top-3 right-3 z-10 flex size-10 items-center justify-center rounded-full bg-ivory/80 text-ink/60 transition-colors hover:bg-sand hover:text-ink"
          >
            <X className="size-5" strokeWidth={1.5} />
          </button>

          <p className="eyebrow flex items-center gap-3 text-gold-deep!">
            <span className="h-px w-6 bg-gold" aria-hidden />
            {offer.eyebrow}
          </p>
          <h2 id="offer-title" className="mt-4 font-serif text-[clamp(1.9rem,3.6vw,2.6rem)] leading-[1.05] font-medium">
            <Rich text={offer.heading} />
          </h2>
          <p className="mt-4 text-[0.92rem] leading-relaxed text-muted">{offer.body}</p>

          {offer.perks && offer.perks.length > 0 && (
            <ul className="mt-5 space-y-2.5">
              {offer.perks.slice(0, 3).map((perk) => (
                <li key={perk} className="flex items-center gap-3 text-[0.88rem] text-ink/85">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-forest text-ivory">
                    <Check className="size-3" strokeWidth={2.5} aria-hidden />
                  </span>
                  {perk}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-7 grid gap-3 sm:grid-cols-[1fr_auto]">
            <Link href={INQUIRY_PATH} onClick={close} className={buttonClass("primary", "md")}>
              {offer.cta}
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </Link>
            <a
              href={whatsappHref(site, `Hi Timeless Ties! I'd like to know more about your offer: ${offer.heading.replace(/\n/g, " ")}`)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ask about this offer on WhatsApp (opens in a new tab)"
              className={cn(buttonClass("outline", "md"), "border-forest/30 text-forest hover:border-forest hover:bg-forest")}
            >
              <WhatsAppIcon className="size-4" />
              <span className="sm:hidden">Ask on WhatsApp</span>
            </a>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            {offer.note ? <p className="text-[0.72rem] text-muted">{offer.note}</p> : <span />}
            <button type="button" onClick={close} className="text-[0.8rem] text-muted underline decoration-muted/30 underline-offset-4 hover:text-ink">
              No thanks
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
