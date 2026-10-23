"use client";

import { Download } from "lucide-react";
import InstallSteps from "@/components/admin/InstallSteps";
import { useInstall } from "@/components/admin/pwa";

/** Offers to install the admin app from the sign-in pages, before anyone has signed in. */
export default function InstallApp() {
  const { mode, install } = useInstall();
  if (!mode) return null;
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
  return (
    <div className="mt-6 rounded-md border border-a-border px-3 py-2.5">
      <p className="mb-1 flex items-center gap-2 text-[13px] font-medium">
        <Download className="size-4 text-a-muted" aria-hidden />
        Install the admin app
      </p>
      <InstallSteps mode={mode} />
    </div>
  );
}
