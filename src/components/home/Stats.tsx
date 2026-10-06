"use client";

import { useEffect, useRef, useState } from "react";
import type { HomeContent, Stat } from "@/types";
import Botanical from "@/components/brand/Botanical";
import { showPlaceholders } from "@/lib/utils";

const DURATION = 1800;

/**
 * Counts from 0 to the value once it scrolls into view. The server renders the final number, so it
 * reads correctly without JavaScript and for reduced-motion visitors (who never see it count).
 */
function CountUp({ stat, delay }: { stat: Stat; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(stat.value);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Below the fold on load, so resetting to 0 here is never seen
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setN(0);
    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now() + delay;
        const tick = (now: number) => {
          const p = Math.min(1, Math.max(0, (now - start) / DURATION));
          // Ease-out expo: quick start, gentle landing
          setN(Math.round(stat.value * (p === 1 ? 1 : 1 - 2 ** (-10 * p))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [stat.value, delay]);

  return (
    <span ref={ref} className="tabular-nums">
      {n}
      {stat.suffix}
    </span>
  );
}

/** Dark band of headline figures between the story and the services. */
export default function Stats({ stats }: { stats: HomeContent["stats"] }) {
  if (stats.placeholder && !showPlaceholders) return null;

  return (
    <section aria-label="Timeless Ties in numbers" className="relative isolate overflow-hidden bg-forest-deep py-12 text-ivory md:py-14">
      <Botanical variant="arc" className="absolute -top-24 -left-24 -z-10 w-[22rem] text-ivory/[0.05]" strokeWidth={1.1} />
      <Botanical variant="arc" className="absolute -right-24 -bottom-24 -z-10 w-[22rem] rotate-180 text-ivory/[0.05]" strokeWidth={1.1} />

      <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-y-10 px-5 md:px-8 lg:grid-cols-4 2xl:max-w-[84rem]">
        {stats.items.map((s, i) => (
          <li key={s.label} className="text-center lg:border-l lg:border-ivory/10 lg:first:border-l-0">
            <span className="block font-serif text-[clamp(2.6rem,4.5vw,3.6rem)] leading-none font-medium text-peach">
              <CountUp stat={s} delay={i * 150} />
            </span>
            <span className="mt-3 block text-[0.7rem] font-semibold tracking-[0.22em] text-ivory/70 uppercase">{s.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
