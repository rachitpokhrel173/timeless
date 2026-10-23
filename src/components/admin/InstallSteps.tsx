import { EllipsisVertical, MonitorDown, Share } from "lucide-react";
import type { InstallMode } from "./pwa";

/** Manual install steps for browsers that didn't offer an install prompt. */
export default function InstallSteps({ mode }: { mode: Exclude<InstallMode, "prompt"> }) {
  const Icon = mode === "ios" ? Share : mode === "android" ? EllipsisVertical : MonitorDown;
  // Only rendered after a tap, so reading window here can't cause a hydration mismatch
  if (mode !== "ios" && !window.isSecureContext)
    return <p className="text-xs leading-relaxed text-a-muted">Installing needs a secure (https://) address. Open the live site to install the app.</p>;
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-a-muted">
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {mode === "desktop" ? (
        <span>
          Click the <span className="font-medium text-a-text">install icon</span> at the right of the address bar, or open the browser menu and choose{" "}
          <span className="font-medium text-a-text">Install Timeless Ties Admin</span> (in some browsers under <span className="font-medium text-a-text">Cast, save and share</span> or{" "}
          <span className="font-medium text-a-text">Apps</span>). If it&rsquo;s already installed, the same icon opens it.
        </span>
      ) : mode === "ios" ? (
        <span>
          Tap <span className="font-medium text-a-text">Share</span>, then <span className="font-medium text-a-text">Add to Home Screen</span>.
        </span>
      ) : (
        <span>
          Open the browser menu <span className="font-medium text-a-text">⋮</span>, then tap <span className="font-medium text-a-text">Install app</span> or{" "}
          <span className="font-medium text-a-text">Add to Home screen</span>.
        </span>
      )}
    </p>
  );
}
