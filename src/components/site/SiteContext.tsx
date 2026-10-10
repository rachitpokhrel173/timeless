"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SiteSettings } from "@/types";

const SiteContext = createContext<SiteSettings | null>(null);

/** Business details from the CMS, for client components on the public site. */
export function SiteProvider({ value, children }: { value: SiteSettings; children: ReactNode }) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const site = useContext(SiteContext);
  if (!site) throw new Error("useSite must be used inside <SiteProvider>");
  return site;
}
