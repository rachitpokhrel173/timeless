"use client";

import { useEffect, useRef, useState } from "react";
import { Code2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const DEVELOPER = {
  name: "Rachit Pokhrel",
  role: "Web Developer",
  url: "http://rachitpokhrel.com.np/",
  linkLabel: "View Website",
  domain: "rachitpokhrel.com.np",
};

/** Footer credit. Hover, focus or tap opens a small card about the developer. */
export default function BuiltBy() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close on Escape or a tap outside
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // A short delay lets the pointer travel from the text into the card without it closing
  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div ref={ref} className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="built-by-card"
        className="transition-colors hover:text-ivory"
      >
        Built by <span className="font-medium text-ivory/85 underline decoration-ivory/30 underline-offset-4">{DEVELOPER.name}</span>
      </button>

      <div
        id="built-by-card"
        role="dialog"
        aria-label={`About ${DEVELOPER.name}`}
        inert={!open}
        className={cn(
          "absolute bottom-full left-0 z-20 mb-3 w-64 rounded-[10px] bg-ivory p-5 text-left text-ink shadow-[0_24px_50px_-20px_rgb(0_0_0/0.6)] transition-[opacity,transform,visibility] duration-200 ease-out md:right-0 md:left-auto",
          open ? "visible translate-y-0 opacity-100" : "invisible translate-y-1 opacity-0",
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest font-serif text-lg text-ivory">
            {DEVELOPER.name
              .split(" ")
              .map((w) => w[0])
              .join("")}
          </span>
          <span>
            <span className="block font-serif text-[1.2rem] leading-tight font-medium">{DEVELOPER.name}</span>
            <span className="flex items-center gap-1.5 text-[0.75rem] text-muted">
              <Code2 className="size-3.5" aria-hidden />
              {DEVELOPER.role}
            </span>
          </span>
        </div>
        <p className="mt-3 text-[0.8rem] leading-relaxed text-muted">Designed and developed this website for Timeless Ties Events &amp; Decor.</p>
        <a
          href={DEVELOPER.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-4 block w-fit text-[0.8rem]"
        >
          <span className="inline-flex items-center gap-1.5 font-medium text-forest underline decoration-forest/30 underline-offset-4 group-hover:decoration-forest">
            {DEVELOPER.linkLabel}
            <ExternalLink className="size-3.5" aria-hidden />
          </span>
          <span className="mt-1 block text-[0.75rem] text-muted">{DEVELOPER.domain}</span>
        </a>
        {/* Little pointer under the card */}
        <span className="absolute -bottom-1.5 left-8 size-3 rotate-45 bg-ivory md:right-8 md:left-auto" aria-hidden />
      </div>
    </div>
  );
}
