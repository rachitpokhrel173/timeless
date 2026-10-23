import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase/env";
import InstallApp from "./InstallApp";

/** Split layout shared by sign-in, forgot and reset password and invitations: a décor photo beside the form. */
export default function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh flex-1 lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-wine lg:block">
        <Image src="/images/grand-mandap-chandelier.jpg" alt="" fill priority sizes="55vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-wine via-wine/55 to-wine/20" aria-hidden />
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-wine/80 to-transparent" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-12 text-ivory">
          <Link href="/" className="w-fit" aria-label="Timeless Ties Events & Decor — back to website">
            <Image src="/brand/logo-ivory.png" alt="" width={96} height={89} />
          </Link>
          <div className="max-w-md">
            <p className="text-[11px] font-medium tracking-[0.3em] text-gold-light uppercase">Weddings · Events · Celebrations</p>
            <p className="mt-4 font-serif text-[2.6rem] leading-[1.1]">
              Every celebration, <em className="text-gold-light">beautifully</em> organised.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ivory/75">Inquiries, quotations, bookings, payments and the website — all in one place.</p>
          </div>
        </div>
      </aside>

      <section className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-xs text-a-muted transition-colors hover:text-a-text">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to website
        </Link>

        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
          <Image src="/brand/logo-wine.png" alt="Timeless Ties Events & Decor" width={72} height={66} priority className="mb-8 rounded-lg bg-white/90 p-1 lg:hidden" />
          <h1 className="font-serif text-[2.4rem] leading-tight font-medium">{title}</h1>
          <p className="mt-2 mb-8 text-[15px] leading-relaxed text-a-muted">{description}</p>
          {!supabaseConfigured() && (
            <p role="alert" className="mb-4 rounded-lg bg-a-warning-soft px-3 py-2 text-sm text-a-warning">
              Supabase isn&rsquo;t configured on this server yet — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
            </p>
          )}
          {children}
          <InstallApp />
        </div>

        <p className="text-center text-[11px] text-a-muted">© {new Date().getFullYear()} Timeless Ties Events &amp; Decor</p>
      </section>
    </main>
  );
}
