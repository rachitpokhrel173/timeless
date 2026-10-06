import type { ReactNode } from "react";

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <section className="border-b border-ink/10 bg-sand px-5 py-16 text-center md:py-24">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="mt-4 font-serif text-[2.75rem] leading-[1.05] font-medium text-balance md:text-7xl">{title}</h1>
      {subtitle && <p className="mx-auto mt-5 max-w-2xl text-base text-muted md:text-lg">{subtitle}</p>}
    </section>
  );
}
