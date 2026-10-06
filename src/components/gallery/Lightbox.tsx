"use client";

import Image from "next/image";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GalleryItem, ImageAsset } from "@/types";
import { formatDate } from "@/lib/utils";

export type Slide = { item: GalleryItem; image: ImageAsset; category: string };

type Props = {
  slides: Slide[];
  /** Open slide, or null when closed. */
  index: number | null;
  onIndexChange: Dispatch<SetStateAction<number | null>>;
};

/**
 * Full-screen viewer built on <dialog>: the browser handles focus trapping, Escape and
 * inerting the page. Adds arrow keys, swipe and backdrop-click to close.
 */
export default function Lightbox({ slides, index, onIndexChange }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);
  const open = index !== null && slides.length > 0;
  const slide = open ? slides[index] : null;

  const close = () => onIndexChange(null);
  const go = (delta: number) =>
    onIndexChange((i) => (i === null ? i : (i + delta + slides.length) % slides.length));

  // Open/close the native dialog and lock page scroll for exactly as long as it is open
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Photo viewer"
      className="lightbox m-0 h-dvh w-screen bg-transparent p-0 text-ivory"
      // State drives the dialog (see effect above); Escape is routed through it too
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClose={close}
      onClick={(e) => e.target === e.currentTarget && close()}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      {slide && (
        <div className="flex h-full flex-col" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="flex items-center justify-between px-4 py-3 md:px-6">
            <p className="text-sm text-ivory/70 tabular-nums" aria-live="polite">
              {index! + 1} / {slides.length}
            </p>
            <button
              type="button"
              onClick={close}
              className="flex size-11 items-center justify-center rounded-full hover:bg-ivory/10"
              aria-label="Close photo viewer"
              autoFocus
            >
              <X className="size-6" strokeWidth={1.5} />
            </button>
          </div>

          <div
            className="relative mx-auto w-full max-w-6xl flex-1 px-2 md:px-20"
            onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
              touchX.current = null;
            }}
          >
            <div className="relative h-full">
              <Image
                key={slide.image.src}
                src={slide.image.src}
                alt={slide.image.alt}
                fill
                sizes="(min-width: 1152px) 1100px, 100vw"
                className="object-contain"
              />
            </div>

            {slides.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute top-1/2 left-2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 hover:bg-ivory/15 md:left-4 md:flex"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-6" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute top-1/2 right-2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 hover:bg-ivory/15 md:right-4 md:flex"
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-6" strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>

          <div className="flex items-end justify-between gap-4 px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6">
            <div>
              <p className="flex items-center gap-3 text-[0.7rem] tracking-[0.2em] text-gold-light uppercase">
                {slide.category}
              </p>
              <h2 className="mt-1 font-serif text-2xl leading-tight">{slide.item.title}</h2>
              {(slide.item.location || slide.item.date) && (
                <p className="mt-1 text-sm text-ivory/65">
                  {[slide.item.location, slide.item.date && formatDate(slide.item.date)].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            {slides.length > 1 && (
              <div className="flex gap-2 md:hidden">
                <button type="button" onClick={() => go(-1)} className="flex size-11 items-center justify-center rounded-full border border-ivory/30" aria-label="Previous photo">
                  <ChevronLeft className="size-5" strokeWidth={1.5} />
                </button>
                <button type="button" onClick={() => go(1)} className="flex size-11 items-center justify-center rounded-full border border-ivory/30" aria-label="Next photo">
                  <ChevronRight className="size-5" strokeWidth={1.5} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
