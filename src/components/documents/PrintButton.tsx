"use client";

import { Printer } from "lucide-react";

export default function PrintButton({ label = "Print / Save as PDF", className }: { label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        "inline-flex h-10 items-center gap-2 rounded-md bg-[#5a1f2b] px-4 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5a1f2b] print:hidden"
      }
    >
      <Printer className="size-4" aria-hidden />
      {label}
    </button>
  );
}
