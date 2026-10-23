"use client";

import { useEffect, useSyncExternalStore } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Chrome/Edge fire beforeinstallprompt once, possibly before React mounts, so it's captured at module load
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Registers the admin service worker. Rendered from the admin root layout so the sign-in pages are
 * installable too. Production only: dev chunks aren't content-hashed, so caching them would serve stale code.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

/**
 * How the admin app can be installed right now:
 * "prompt" — the browser offered an install prompt (Chrome, Edge, Android);
 * "ios" — iPhone/iPad, which only installs via Share → Add to Home Screen;
 * "android" — an Android browser that hasn't offered a prompt (yet, or at all), installed from its ⋮ menu;
 * null — already installed, or the browser doesn't support installing.
 * Installing needs HTTPS; on the dev server's http://192.168.x.x address the steps say so.
 */
export function useInstall() {
  const mode = useSyncExternalStore<"prompt" | "ios" | "android" | null>(
    subscribe,
    () => {
      if (matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone) return null;
      if (deferred) return "prompt";
      if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return "ios";
      return /Android/.test(navigator.userAgent) ? "android" : null;
    },
    () => null,
  );
  const install = async () => {
    if (!deferred) return;
    const e = deferred;
    deferred = null;
    emit();
    await e.prompt();
  };
  return { mode, install } as const;
}
