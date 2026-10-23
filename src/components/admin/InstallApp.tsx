"use client";

import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import InstallSteps from "./InstallSteps";
import { useInstall } from "./pwa";

/** Full-width offer to install the admin app, shown on the sign-in pages and the dashboard until it's installed. */
export default function InstallApp({ className }: { className?: string }) {
  const { mode, install } = useInstall();
  if (!mode) return null;
  if (mode === "prompt")
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={cn("flex h-10 w-full items-center justify-center gap-2 rounded-md border border-a-border text-[13px] font-medium transition-colors hover:bg-a-hover", className)}
      >
        <Download className="size-4 text-a-muted" aria-hidden />
        Install the admin app
      </button>
    );
  return (
    <div className={cn("rounded-md border border-a-border px-3 py-2.5", className)}>
      <p className="mb-1 flex items-center gap-2 text-[13px] font-medium">
        <Download className="size-4 text-a-muted" aria-hidden />
        Install the admin app
      </p>
      <InstallSteps mode={mode} />
    </div>
  );
}
