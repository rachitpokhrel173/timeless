import type { ReactNode } from "react";
import PageHeader from "./PageHeader";

export type LegalSection = { id: string; title: string; body: ReactNode };

/** Terms and privacy layout: header, "last updated", a contents list and numbered sections. */
export default function LegalPage({ title, intro, updated, sections }: { title: string; intro: ReactNode; updated: string; sections: LegalSection[] }) {
  return (
    <>
      <PageHeader title={title} subtitle={`Last updated ${updated}`} />
      <div className="mx-auto max-w-3xl px-5 py-14 md:py-20">
        <div className="space-y-4 text-[1.02rem] leading-relaxed text-muted">{intro}</div>

        <nav aria-label="Contents" className="mt-10 rounded-2xl border border-ink/10 bg-sand/60 p-6">
          <p className="text-[0.72rem] font-medium tracking-[0.25em] text-muted uppercase">Contents</p>
          <ol className="mt-4 gap-8 text-[0.92rem] sm:columns-2 [&>li]:mb-2 [&>li]:break-inside-avoid">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-ink/80 transition-colors hover:text-gold-deep">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-12">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-28">
              <h2 className="font-serif text-[1.75rem] leading-tight font-medium">
                <span className="mr-2 text-gold-deep">{i + 1}.</span>
                {s.title}
              </h2>
              <div className="legal-body mt-4 space-y-4 leading-relaxed text-muted [&_a]:text-ink [&_a]:underline [&_a]:decoration-gold [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
