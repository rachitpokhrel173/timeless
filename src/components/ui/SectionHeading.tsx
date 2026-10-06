import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  tone?: "light" | "dark";
  id?: string;
  className?: string;
};

/** Eyebrow + H2 + intro used at the top of homepage sections. */
export default function SectionHeading({ eyebrow, title, description, align = "left", tone = "light", id, className }: Props) {
  const dark = tone === "dark";
  return (
    <div className={cn(align === "center" && "mx-auto text-center", "max-w-2xl", className)}>
      {eyebrow && <p className={cn("eyebrow", dark && "!text-gold-light")}>{eyebrow}</p>}
      <h2
        id={id}
        className="mt-4 font-serif text-[2.35rem] leading-[1.04] font-medium tracking-[-0.01em] text-balance sm:text-5xl lg:text-[3.5rem]"
      >
        {title}
      </h2>
      {description && (
        <p className={cn("mt-5 text-base leading-relaxed sm:text-lg", dark ? "text-ivory/70" : "text-muted")}>
          {description}
        </p>
      )}
    </div>
  );
}
