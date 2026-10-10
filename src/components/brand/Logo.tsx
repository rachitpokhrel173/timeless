"use client";

import Image from "next/image";
import { useSite } from "@/components/site/SiteContext";
import { cn } from "@/lib/utils";
import Botanical from "./Botanical";

/**
 * Brand mark. Renders the uploaded logo (from Website → Business details) when one is configured; until then a
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
  const siteSettings = useSite();
  if (siteSettings.logo) {
    const light = tone === "ivory" && siteSettings.logoOnDark;
    const l = light || siteSettings.logo;
    const image = (
      <Image
        src={l.src}
        alt={siteSettings.name}
        width={l.width}
        height={l.height}
        preload={preload}
        className={cn(
          size === "lg" ? "h-24 w-auto" : "h-14 w-auto md:h-[4.5rem]",
          // Light logo over a photo: a soft shadow keeps it readable on bright areas
          light && "drop-shadow-[0_1px_8px_rgb(0_0_0/0.55)]",
          className,
        )}
      />
    );
    // No light version uploaded: back the regular logo so it stays visible over the dark hero
    if (tone === "ivory" && !light) return <span className="inline-flex rounded-xl bg-ivory/90 px-2 py-1 shadow-[0_6px_20px_-8px_rgb(0_0_0/0.45)] backdrop-blur-sm">{image}</span>;
    return image;
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5 leading-none", tone === "wine" ? "text-burgundy" : "text-ivory drop-shadow-[0_1px_8px_rgb(0_0_0/0.6)]", className)}>
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
