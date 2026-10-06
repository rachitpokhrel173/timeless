import type { PriceList } from "@/types";
import { formatPrice } from "@/lib/utils";

/** A rate card laid out like a menu: item, dotted leader, price. */
export default function PriceListCard({ list }: { list: PriceList }) {
  return (
    <section id={list.slug} aria-labelledby={`${list.slug}-title`} className="scroll-mt-28 rounded-[6px] bg-paper p-6 shadow-[0_1px_0_rgb(44_34_36/0.04),0_14px_34px_-28px_rgb(44_34_36/0.5)] md:p-9">
      <h3 id={`${list.slug}-title`} className="font-serif text-[1.9rem] leading-tight font-medium md:text-[2.2rem]">
        {list.name}
      </h3>
      <div className="mt-3 h-px w-12 bg-gold" aria-hidden />
      <dl className="mt-6 space-y-4">
        {list.rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-3">
            <dt className="min-w-0 text-[0.95rem]">{row.label}</dt>
            <span className="min-w-6 flex-1 translate-y-[-0.2em] border-b border-dotted border-ink/25" aria-hidden />
            <dd className="text-right text-[0.88rem] font-semibold whitespace-nowrap text-burgundy">{formatPrice(row.price)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
