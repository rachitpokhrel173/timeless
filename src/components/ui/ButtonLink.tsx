import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const variants = {
  /** Forest green — the main call to action on light surfaces. */
  primary: "bg-forest text-ivory shadow-[0_8px_20px_-12px_rgb(35_44_38/0.6)] hover:bg-forest-deep",
  /** Soft peach pill — the main call to action on photos and dark surfaces. */
  peach: "bg-peach text-ink hover:bg-ivory",
  /** Ivory button — the strongest CTA on burgundy or photo backgrounds. */
  gold: "bg-ivory text-wine hover:bg-sand",
  /** Light button on dark surfaces. */
  light: "bg-ivory text-wine hover:bg-sand",
  outline: "border border-burgundy/40 text-burgundy hover:border-burgundy hover:bg-burgundy hover:text-ivory",
  "outline-light": "border border-ivory/45 text-ivory hover:border-ivory hover:bg-ivory/10",
} as const;

const sizes = {
  sm: "h-11 px-6 text-[0.82rem]",
  md: "h-12 px-7 text-[0.86rem]",
  lg: "h-13 px-8 text-[0.9rem]",
} as const;

type Props = {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** Extra classes — layout only (width, margin). Don't override display, height or padding; add a size instead. */
  className?: string;
  /** Opens in a new tab with safe rel attributes. Used for WhatsApp and social links. */
  external?: boolean;
} & Omit<ComponentProps<"a">, "href" | "children" | "className">;

export const buttonClass = (variant: keyof typeof variants = "primary", size: keyof typeof sizes = "md") =>
  cn(
    "group inline-flex items-center justify-center gap-2.5 rounded-full font-medium tracking-[0.01em] whitespace-nowrap transition-[background-color,color,border-color,box-shadow] duration-300 ease-out",
    variants[variant],
    sizes[size],
    (variant === "primary" || variant === "peach") && "btn-shine",
  );

/** A link styled as a button. Internal routes use next/link; tel:, mailto: and external URLs use <a>. */
export default function ButtonLink({ href, children, variant, size, className, external, ...rest }: Props) {
  const classes = cn(buttonClass(variant, size), className);

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {children}
      </a>
    );
  }
  if (!href.startsWith("/")) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}
