"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HomeContent } from "@/types";
import Reveal from "@/components/ui/Reveal";
import SectionTitle from "@/components/ui/SectionTitle";
import { cn, showPlaceholders } from "@/lib/utils";

/** Stand-in for a missing "before" photo: the finished setup, greyed and dimmed. Dev only. */
const SIMULATED_BEFORE = "grayscale(1) brightness(0.55) contrast(0.85) blur(1.5px)";

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Drag-to-compare slider. Pointer drag anywhere on the photo, or arrow keys on the (visually hidden)
 * range input. The first time it scrolls into view the handle sweeps once to show it can be moved.
 */
export default function BeforeAfter({ transform }: { transform: HomeContent["transform"] }) {
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const dragging = useRef(false);

  // One-time hint sweep: 50 → 72 → 30 → 50, stopped by any interaction
  useEffect(() => {
    const el = frameRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now() + 500;
        const keys = [50, 72, 30, 50];
        const step = 750;
        const tick = (now: number) => {
          if (touched.current) return;
          const t = Math.max(0, now - start);
          const i = Math.min(Math.floor(t / step), keys.length - 2);
          const p = Math.min(1, (t - i * step) / step);
          const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
          setPos(keys[i] + (keys[i + 1] - keys[i]) * eased);
          if (t < step * (keys.length - 1)) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  if (transform.placeholder && !showPlaceholders) return null;
  const item = transform.items[active];
  if (!item) return null;

  const moveTo = (clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(clamp(((clientX - rect.left) / rect.width) * 100));
  };

  return (
    <section aria-labelledby="transform-title" className="bg-paper py-16 md:py-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 md:px-8 lg:grid-cols-[0.75fr_2fr] lg:items-center lg:gap-12 2xl:max-w-[84rem]">
        <Reveal>
          <SectionTitle id="transform-title" eyebrow={transform.eyebrow} title={transform.heading} intro={transform.intro} size="sm" />
          {transform.items.length > 1 && (
            <div className="mt-7 flex flex-wrap gap-2" role="group" aria-label="Choose an event">
              {transform.items.map((t, i) => (
                <button
                  key={t.label}
                  type="button"
                  aria-pressed={i === active}
                  onClick={() => {
                    setActive(i);
                    setPos(50);
                  }}
                  className={cn(
                    "h-10 rounded-full px-5 text-[0.82rem] font-medium transition-colors duration-300",
                    i === active ? "bg-forest text-ivory" : "border border-forest/25 text-forest hover:border-forest",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </Reveal>

        <Reveal variant="curtain" delay={100}>
          <div
            ref={frameRef}
            className="group/ba relative aspect-[16/10] cursor-ew-resize touch-pan-y overflow-hidden rounded-[8px] bg-forest-deep shadow-[0_30px_60px_-36px_rgb(44_34_36/0.6)] select-none"
            onPointerDown={(e) => {
              touched.current = true;
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              moveTo(e.clientX);
            }}
            onPointerMove={(e) => dragging.current && moveTo(e.clientX)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            {/* After: the full photo underneath */}
            <Image
              key={`after-${active}`}
              src={item.after.src}
              alt={`After: ${item.after.alt}`}
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="fade-in object-cover"
              style={{ objectPosition: item.after.focus }}
              draggable={false}
            />
            {/* Before: the same frame, clipped to the left of the handle */}
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
              <Image
                key={`before-${active}`}
                src={item.before.src}
                alt={`Before: ${item.before.alt}`}
                fill
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="fade-in object-cover"
                style={{ objectPosition: item.before.focus, filter: item.simulateBefore ? SIMULATED_BEFORE : undefined }}
                draggable={false}
              />
            </div>

            <span className="pointer-events-none absolute top-4 left-4 rounded-full bg-forest-deep/70 px-3 py-1 text-[0.65rem] font-semibold tracking-[0.2em] text-ivory uppercase backdrop-blur-sm">
              Before
            </span>
            <span className="pointer-events-none absolute top-4 right-4 rounded-full bg-peach/90 px-3 py-1 text-[0.65rem] font-semibold tracking-[0.2em] text-ink uppercase backdrop-blur-sm">
              After
            </span>

            {/* Keyboard control; the visible handle mirrors its focus ring */}
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(pos)}
              onChange={(e) => {
                touched.current = true;
                setPos(Number(e.target.value));
              }}
              aria-label={`Compare before and after: ${item.label}`}
              aria-valuetext={`${Math.round(pos)}% before`}
              className="peer pointer-events-none absolute inset-0 h-full w-full opacity-0"
            />

            <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ivory shadow-[0_0_12px_rgb(0_0_0/0.35)] peer-focus-visible:*:ring-2" style={{ left: `${pos}%` }} aria-hidden>
              <span className="absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ivory text-forest shadow-[0_8px_24px_-6px_rgb(0_0_0/0.5)] ring-forest/40 transition-transform duration-300 group-active/ba:scale-110">
                <ChevronLeft className="-mr-1 size-4" strokeWidth={2} />
                <ChevronRight className="-ml-1 size-4" strokeWidth={2} />
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
