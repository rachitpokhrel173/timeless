import { EllipsisVertical, Share } from "lucide-react";

/** Manual install steps for phones whose browser has no install prompt. */
export default function InstallSteps({ mode }: { mode: "ios" | "android" }) {
  const Icon = mode === "ios" ? Share : EllipsisVertical;
  // Only rendered after a tap, so reading window here can't cause a hydration mismatch
  if (mode === "android" && !window.isSecureContext)
    return <p className="text-xs leading-relaxed text-a-muted">Installing needs a secure (https://) address. Open the live site on this phone to install the app.</p>;
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-a-muted">
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {mode === "ios" ? (
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
