"use client";

import NextLink from "next/link";
import { useRef, useState, type ComponentProps } from "react";

/**
 * next/link for the admin, preloading on intent instead of on sight.
 *
 * The default Link preloads every link that scrolls into view. Admin pages are rendered per
 * user, so a list page fired ~45 server renders at once on every visit; they competed with the
 * page actually being opened and some were refused (503). This preloads the whole page only
 * when the pointer rests on a link (or a finger touches it), which is usually enough of a head
 * start for the page to be ready by the click.
 */
export default function Link({ prefetch, onMouseEnter, onMouseLeave, onTouchStart, ...props }: ComponentProps<typeof NextLink>) {
  const [hot, setHot] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const off = prefetch === false;
  return (
    <NextLink
      {...props}
      prefetch={!off && hot}
      onMouseEnter={(e) => {
        // A short pause, so sweeping the pointer across a list doesn't preload every row
        if (!off && !hot) timer.current = setTimeout(() => setHot(true), 100);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (timer.current) clearTimeout(timer.current);
        onMouseLeave?.(e);
      }}
      onTouchStart={(e) => {
        if (!off) setHot(true);
        onTouchStart?.(e);
      }}
    />
  );
}
