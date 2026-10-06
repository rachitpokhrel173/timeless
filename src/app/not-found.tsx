import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center px-5 py-32 text-center">
      <p className="eyebrow">Page not found</p>
      <h1 className="mt-5 font-serif text-6xl md:text-7xl">
        This page took an <em className="text-gold">early exit.</em>
      </h1>
      <p className="mt-6 text-lg text-muted">The link may be old or mistyped. Let&rsquo;s get you back to the party.</p>
      <Link
        href="/"
        className="mt-10 inline-flex items-center gap-2 rounded-full bg-ink px-8 py-4 text-sm tracking-wide text-ivory hover:bg-gold"
      >
        Back to home
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
