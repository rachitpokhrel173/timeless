import { cn } from "@/lib/utils";
import Rich from "./Rich";

/** Eyebrow + H2 (+ optional intro) used by every homepage section, so headings stay consistent. */
export default function SectionTitle({
  id,
  eyebrow,
  title,
  intro,
  align = "left",
  tone = "dark",
  size = "lg",
  className,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
  tone?: "dark" | "light";
  /** `sm` for the compact homepage sections. */
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <div className={cn(align === "center" && "mx-auto max-w-2xl text-center", className)}>
      {eyebrow && <p className={cn("eyebrow", tone === "light" && "text-ivory/70!")}>{eyebrow}</p>}
      <h2
        id={id}
        className={cn(
          "font-serif leading-[1.1] font-medium",
          size === "sm" ? "text-[clamp(1.9rem,3vw,2.5rem)]" : "text-[clamp(2.2rem,4.2vw,3.5rem)]",
          eyebrow && (size === "sm" ? "mt-3" : "mt-4"),
          tone === "light" ? "text-ivory" : "text-ink",
        )}
      >
        <Rich text={title} emClassName={tone === "light" ? "text-rose" : undefined} />
      </h2>
      {intro && (
        <p className={cn("mt-5 text-[1.02rem] leading-relaxed", tone === "light" ? "text-ivory/75" : "text-muted", align === "center" ? "mx-auto max-w-xl" : "max-w-lg")}>
          {intro}
        </p>
      )}
    </div>
  );
}
