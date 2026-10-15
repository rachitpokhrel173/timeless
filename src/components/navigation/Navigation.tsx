"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, Phone, X } from "lucide-react";
import { INQUIRY_PATH, navLinks } from "@/data/site";
import { useSite } from "@/components/site/SiteContext";
import Logo from "@/components/brand/Logo";
import { buttonClass } from "@/components/ui/ButtonLink";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { cn, telHref, whatsappHref } from "@/lib/utils";

export default function Navigation() {
  const site = useSite();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [tucked, setTucked] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // React bails out when the boolean doesn't change, so this is cheap on every scroll event
    let lastY = window.scrollY;
    const update = () => {
      const y = window.scrollY;
      setScrolled(y > 16);
      // Tuck the header away while reading down the page; bring it back on any scroll up
      if (Math.abs(y - lastY) > 6) {
        setTucked(y > lastY && y > 480);
        lastY = y;
      }
    };
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
  // On the homepage the header floats, transparent, over the full-bleed hero until the page scrolls
  const overlay = pathname === "/" && !scrolled && !open;

  return (
    <header
      // Keyboard users tabbing into a tucked header bring it back
      onFocus={() => setTucked(false)}
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,border-color,box-shadow,translate] duration-500 ease-out",
        tucked && !open && "-translate-y-full",
        // No backdrop-filter while the menu is open: it would become the containing block of the fixed menu
        open
          ? "border-ink/8 bg-ivory"
          : scrolled
            ? "border-ink/8 bg-ivory/[0.97] shadow-[0_6px_24px_-18px_rgb(44_34_36/0.35)]"
            : overlay
              ? "border-transparent bg-transparent"
              : "border-transparent bg-ivory",
      )}
    >
      <div className={cn("relative z-10 mx-auto flex max-w-7xl 2xl:max-w-[84rem] items-center justify-between gap-6 px-5 transition-[height] duration-500 md:px-8", scrolled ? "h-[4.25rem]" : "h-[4.75rem] md:h-[5.5rem]")}>
        <Link href="/" aria-label={`${site.name} — home`} className="relative z-10 shrink-0">
          <Logo preload tone={overlay ? "ivory" : "wine"} />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-9">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(
                    "relative py-2 text-[0.86rem] font-medium transition-colors duration-300",
                    "after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:bg-current after:transition-transform after:duration-300",
                    overlay
                      ? isActive(link.href)
                        ? "text-ivory after:scale-x-100"
                        : "text-ivory/80 after:scale-x-0 hover:text-ivory hover:after:scale-x-100"
                      : isActive(link.href)
                        ? "text-forest after:scale-x-100"
                        : "text-ink/75 after:scale-x-0 hover:text-forest hover:after:scale-x-100",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <Link href={INQUIRY_PATH} className={buttonClass(overlay ? "peach" : "primary", "sm")}>
              Get a Quote
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>
          <button
            ref={toggleRef}
            type="button"
            className={cn("relative z-10 -mr-2 flex size-11 items-center justify-center lg:hidden", overlay ? "text-ivory" : "text-forest")}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-6" strokeWidth={1.5} /> : <Menu className="size-6" strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* Mobile menu — always mounted so it can fade; `inert` keeps it out of the tab order when closed */}
      <div
        id="mobile-menu"
        inert={!open}
        className={cn(
          "fixed inset-0 overflow-y-auto bg-ivory px-5 pt-28 pb-10 transition-[opacity,visibility] duration-300 ease-out lg:hidden",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        <nav aria-label="Mobile">
          <ul className="border-t border-burgundy/10">
            {navLinks.map((link, i) => (
              <li
                key={link.href}
                className={cn("border-b border-burgundy/10 transition-[opacity,transform] duration-500 ease-out", open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")}
                style={{ transitionDelay: open ? `${60 + i * 40}ms` : "0ms" }}
              >
                <Link
                  ref={i === 0 ? firstLinkRef : undefined}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn("flex items-center justify-between py-4 font-serif text-[2rem] leading-none", isActive(link.href) ? "text-burgundy italic" : "text-ink")}
                >
                  {link.label}
                  <ArrowRight className="size-4 text-burgundy/50" strokeWidth={1.5} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Link href={INQUIRY_PATH} onClick={() => setOpen(false)} className={cn(buttonClass("primary", "lg"), "mt-8 w-full")}>
          Plan Your Event
          <ArrowRight className="size-4" aria-hidden />
        </Link>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <a href={telHref(site)} className={buttonClass("outline")}>
            <Phone className="size-4" strokeWidth={1.5} aria-hidden />
            Call
          </a>
          <a href={whatsappHref(site)} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
            <WhatsAppIcon className="size-4" />
            WhatsApp
          </a>
        </div>
        <p className="mt-8 text-center text-sm text-muted">
          {site.address.street}, {site.address.city} · {site.address.country}
        </p>
      </div>
    </header>
  );
}
