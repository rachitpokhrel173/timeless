"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { INQUIRY_PATH } from "@/data/site";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { useSite } from "@/components/site/SiteContext";
import { cn, telHref, whatsappHref } from "@/lib/utils";

/**
 * Mobile: a slim bottom bar (Plan Your Event · Call · WhatsApp) that slides in once the first
 * screen is out of view, so the primary action is always one thumb-tap away.
 * Desktop: a small floating WhatsApp button.
 */
export default function QuickContact() {
  const site = useSite();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // React bails out when the boolean doesn't change, so this is cheap on every scroll event
    const update = () => setVisible(window.scrollY > window.innerHeight * 0.8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  // These pages already show the form and every contact option
  if (pathname.startsWith(INQUIRY_PATH) || pathname.startsWith("/contact")) return null;

  return (
    <>
      <div
        inert={!visible}
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-ivory/[0.97] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-700 ease-[cubic-bezier(0.65,0.05,0.36,1)] md:hidden",
          visible ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex items-center gap-2">
          <Link href={INQUIRY_PATH} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-forest text-[0.86rem] font-medium text-ivory">
            Plan Your Event
          </Link>
          <a href={telHref(site)} aria-label="Call us" className="flex size-12 items-center justify-center rounded-full border border-forest/25 text-forest">
            <Phone className="size-[1.1rem]" strokeWidth={1.4} aria-hidden />
          </a>
          <a
            href={whatsappHref(site)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat on WhatsApp (opens in a new tab)"
            className="flex size-12 items-center justify-center rounded-full border border-forest/25 text-forest"
          >
            <WhatsAppIcon className="size-5" />
          </a>
        </div>
      </div>

      <a
        href={whatsappHref(site)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp (opens in a new tab)"
        className={cn(
          "fixed right-6 bottom-6 z-30 hidden size-13 items-center justify-center rounded-full bg-forest text-ivory transition-[transform,opacity,background-color] duration-500 hover:bg-forest-deep md:flex",
          visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <WhatsAppIcon className="size-6" />
      </a>
    </>
  );
}
