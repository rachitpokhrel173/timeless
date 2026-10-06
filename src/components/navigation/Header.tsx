"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, Phone, X } from "lucide-react";
import { INQUIRY_PATH, navLinks, siteSettings } from "@/data/site";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import Wordmark from "@/components/ui/Wordmark";
import { buttonClass } from "@/components/ui/ButtonLink";
import { cn, pad2, telHref, whatsappHref } from "@/lib/utils";

/** Pages whose first section is a full-bleed photo the header can sit transparently over. */
const OVERLAY_ROUTES = new Set(["/"]);

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  const overlay = OVERLAY_ROUTES.has(pathname) && !scrolled && !open;

  useEffect(() => {
    // React bails out when the boolean doesn't change, so this is cheap on every scroll event
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  // While open: lock scroll, close on Escape, move focus in and back out
  useEffect(() => {
    if (!open) return;
    const toggle = toggleRef.current;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    firstLinkRef.current?.focus({ preventScroll: true });
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      toggle?.focus({ preventScroll: true });
    };
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,color,box-shadow,backdrop-filter] duration-500",
        // No backdrop-filter while the menu is open: it would become the containing block of the fixed menu
        open
          ? "bg-ivory text-ink"
          : overlay
            ? "bg-transparent text-ivory"
            : "bg-ivory/90 text-ink shadow-[0_1px_0_rgb(28_25_23/0.08)] backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5 md:h-20 md:px-8">
        <Link href="/" aria-label={`${siteSettings.name} — home`} className="relative z-10">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-9">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(
                    "relative py-2 text-[0.8rem] tracking-[0.14em] uppercase transition-opacity",
                    "after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:bg-current after:transition-transform after:duration-300",
                    isActive(link.href) ? "after:scale-x-100" : "opacity-80 after:scale-x-0 hover:opacity-100 hover:after:scale-x-100",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {/* Mobile gets this CTA in the menu and the sticky bottom bar instead */}
          <div className="hidden sm:block">
            <Link href={INQUIRY_PATH} className={buttonClass(overlay ? "light" : "primary", "sm")}>
              Plan Your Event
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>

          <button
            ref={toggleRef}
            type="button"
            className="relative z-10 -mr-2 flex size-11 items-center justify-center lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-6" strokeWidth={1.5} /> : <Menu className="size-6" strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* Mobile menu — always mounted so it can animate; `inert` keeps it out of tab order when closed */}
      <div
        id="mobile-menu"
        inert={!open}
        className={cn(
          "fixed inset-x-0 top-0 h-dvh overflow-y-auto bg-ivory px-5 pt-28 pb-10 text-ink transition-[opacity,visibility] duration-300 lg:hidden",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        <nav aria-label="Mobile">
          <ul className="border-t border-ink/10">
            {navLinks.map((link, i) => (
              <li
                key={link.href}
                className={cn("border-b border-ink/10 transition-[opacity,transform] duration-500", open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}
                style={{ transitionDelay: open ? `${80 + i * 45}ms` : "0ms" }}
              >
                <Link
                  ref={i === 0 ? firstLinkRef : undefined}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className="flex items-baseline gap-4 py-4"
                >
                  <span className="font-serif text-sm text-gold-deep">{pad2(i + 1)}</span>
                  <span className={cn("font-serif text-[2rem] leading-none", isActive(link.href) && "italic")}>{link.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-8 grid gap-3">
          <Link href={INQUIRY_PATH} onClick={() => setOpen(false)} className={cn(buttonClass("primary", "lg"), "w-full")}>
            Plan Your Event
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <a href={telHref()} className={buttonClass("outline")}>
              <Phone className="size-4" strokeWidth={1.5} aria-hidden />
              Call
            </a>
            <a href={whatsappHref()} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
              <WhatsAppIcon className="size-4" />
              WhatsApp
            </a>
          </div>
        </div>
        <p className="mt-8 text-center text-sm text-muted">
          {siteSettings.address.street}, {siteSettings.address.city} · {siteSettings.phones[0].label}
        </p>
      </div>
    </header>
  );
}
