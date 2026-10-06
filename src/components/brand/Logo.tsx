import Image from "next/image";
import { siteSettings } from "@/data/site";
import { cn } from "@/lib/utils";
import Botanical from "./Botanical";

/**
 * Brand mark. Renders the uploaded logo (siteSettings.logo) when one is configured; until then a
 * typeset stand-in in the logo's language — wine italic serif, tracked caps and a fine sprig.
 */
export default function Logo({
  tone = "wine",
  size = "md",
  className,
  preload,
}: {
  tone?: "wine" | "ivory";
  size?: "md" | "lg";
  className?: string;
  /** Set on the header instance only. */
  preload?: boolean;
}) {
  if (siteSettings.logo) {
    const l = (tone === "ivory" && siteSettings.logoOnDark) || siteSettings.logo;
    return (
      <Image
        src={l.src}
        alt={siteSettings.name}
        width={l.width}
        height={l.height}
        preload={preload}
        className={cn(size === "lg" ? "h-24 w-auto" : "h-14 w-auto md:h-16", className)}
      />
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5 leading-none", tone === "wine" ? "text-burgundy" : "text-ivory", className)}>
      <Botanical variant="sprig" className={cn("w-auto -rotate-12 opacity-80", size === "lg" ? "h-12" : "h-9")} strokeWidth={1.6} />
      <span className="flex flex-col">
        <span className={cn("font-serif font-semibold italic tracking-[0.01em]", size === "lg" ? "text-[2.2rem]" : "text-[1.6rem] md:text-[1.75rem]")}>
          Timeless Ties
        </span>
        <span className={cn("mt-1 pl-0.5 font-semibold tracking-[0.4em] uppercase", size === "lg" ? "text-[0.6rem]" : "text-[0.5rem]")}>
          Events &amp; Decor
        </span>
      </span>
    </span>
  );
}
