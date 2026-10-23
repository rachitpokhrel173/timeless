"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import InstallSteps from "./InstallSteps";
import { useInstall } from "./pwa";

/**
 * Full-width "Install the admin app" button for the sign-in pages, on desktop and phones alike.
 * Opens the browser's install prompt when there is one; otherwise shows the steps beneath it.
 */
export default function InstallApp({ className }: { className?: string }) {
  const { mode, install } = useInstall();
  const [steps, setSteps] = useState(false);
  if (!mode) return null;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => (mode === "prompt" ? void install() : setSteps((s) => !s))}
        aria-expanded={mode === "prompt" ? undefined : steps}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-a-border text-[13px] font-medium transition-colors hover:bg-a-hover"
      >
        <Download className="size-4 text-a-muted" aria-hidden />
        Install the admin app
      </button>
      {steps && mode !== "prompt" && (
        <div className="mt-2 rounded-md bg-a-subtle px-3 py-2.5">
          <InstallSteps mode={mode} />
        </div>
      )}
    </div>
  );
}
