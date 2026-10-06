"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

// Fades children in when they scroll into view (see [data-reveal] in globals.css)
export default function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
  variant = "fade",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li";
  /** `curtain` wipes photos open from the bottom and settles a slight zoom. */
  variant?: "fade" | "curtain";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.shown = "true";
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      data-reveal={variant}
      className={className}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
