import { cn } from "@/lib/utils";

/** Dev-only marker on sample content that must be replaced before launch. */
export default function PlaceholderBadge({ className, label = "Placeholder" }: { className?: string; label?: string }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-dashed border-current px-2.5 py-0.5 text-[0.65rem] font-medium tracking-[0.15em] uppercase",
        className,
      )}
    >
      {label}
    </span>
  );
}
