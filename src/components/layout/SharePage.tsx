"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { FacebookIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { useSite } from "@/components/site/SiteContext";

const noop = () => () => {};

const button =
  "flex size-11 items-center justify-center rounded-full border border-forest/25 text-forest transition-colors hover:border-gold-deep hover:text-gold-deep focus-visible:border-gold-deep";

/**
 * "Share this page" row above the footer: Facebook, WhatsApp, copy link, and the phone's own share
 * sheet where the browser has one (reaches Instagram, Messenger, Viber and the rest).
 * Shares the clean page address, without the visitor's tracking parameters.
 */
export default function SharePage() {
  const site = useSite();
  const pathname = usePathname();
  const url = new URL(pathname, site.url).toString();
  const [copied, setCopied] = useState(false);
  // Known only in the browser; false while server rendering
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };
  const nativeShare = () => navigator.share({ title: document.title, url }).catch(() => {});

  return (
    <section aria-label="Share this page" className="border-t border-ink/10 bg-ivory">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-3 px-5 py-6 md:px-8 2xl:max-w-[84rem]">
        <p className="text-[0.72rem] font-medium tracking-[0.25em] text-muted uppercase">Share this page</p>
        <ul className="flex gap-3">
          <li>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on Facebook (opens in a new tab)"
              className={button}
            >
              <FacebookIcon className="size-[18px]" />
            </a>
          </li>
          <li>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on WhatsApp (opens in a new tab)"
              className={button}
            >
              <WhatsAppIcon className="size-[18px]" />
            </a>
          </li>
          <li>
            <button type="button" onClick={copy} aria-label={copied ? "Link copied" : "Copy link"} className={button}>
              {copied ? <Check className="size-[18px]" strokeWidth={1.5} aria-hidden /> : <Link2 className="size-[18px]" strokeWidth={1.5} aria-hidden />}
            </button>
          </li>
          {canShare && (
            <li>
              <button type="button" onClick={nativeShare} aria-label="More sharing options" className={button}>
                <Share2 className="size-[18px]" strokeWidth={1.5} aria-hidden />
              </button>
            </li>
          )}
        </ul>
        <span role="status" className="sr-only">
          {copied ? "Link copied to clipboard" : ""}
        </span>
      </div>
    </section>
  );
}
