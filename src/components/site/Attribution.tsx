"use client";

import { useEffect } from "react";

const KEY = "tt_attribution";
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

/** First-touch attribution for this visit: where the visitor came from and which page they landed on. */
export function readAttribution(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Mounted on every public page; records the first page of the visit (never overwritten during the session). */
export default function Attribution() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
      const params = new URLSearchParams(location.search);
      const data: Record<string, string> = { landing: location.pathname.slice(0, 200) };
      for (const k of UTM) {
        const v = params.get(k);
        if (v) data[k] = v.slice(0, 100);
      }
      // Only external referrers are useful for attribution
      if (document.referrer && new URL(document.referrer).host !== location.host) data.referrer = new URL(document.referrer).host;
      sessionStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage blocked — attribution is optional */
    }
  }, []);
  return null;
}
