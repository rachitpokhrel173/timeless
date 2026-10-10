import Image from "next/image";
import type { ReactNode } from "react";
import { supabaseConfigured } from "@/lib/supabase/env";

/** Centered card layout shared by sign-in, forgot and reset password. */
export default function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/brand/logo-wine.png" alt="Timeless Ties Events & Decor" width={88} height={81} priority className="rounded-md bg-white/90 p-1" />
          <h1 className="mt-5 font-serif text-3xl font-medium">{title}</h1>
          <p className="mt-1 text-a-muted">{description}</p>
        </div>
        {!supabaseConfigured() && (
          <p role="alert" className="mb-4 rounded-md bg-a-warning-soft px-3 py-2 text-sm text-a-warning">
            Supabase isn&rsquo;t configured on this server yet — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
          </p>
        )}
        {children}
      </div>
    </main>
  );
}
