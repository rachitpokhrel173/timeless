"use client";

import { Download, Share } from "lucide-react";
import { useInstall } from "@/components/admin/pwa";

/** Offers to install the admin app from the sign-in pages, before anyone has signed in. */
export default function InstallApp() {
  const { mode, install } = useInstall();
  if (mode === "prompt")
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-a-border text-[13px] font-medium transition-colors hover:bg-a-hover"
      >
        <Download className="size-4 text-a-muted" aria-hidden />
        Install the admin app
      </button>
    );
  if (mode === "ios")
    return (
      <p className="mt-6 flex items-start justify-center gap-2 text-xs text-a-muted">
        <Share className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Install as an app: tap Share, then <span className="font-medium text-a-text">Add to Home Screen</span>.
        </span>
      </p>
    );
  return null;
}
