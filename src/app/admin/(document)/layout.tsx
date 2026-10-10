import { requirePage } from "@/lib/auth/session";

// Printable documents: signed-in staff only, no admin chrome
export const dynamic = "force-dynamic";

export default async function DocumentLayout({ children }: LayoutProps<"/admin">) {
  await requirePage();
  return <div className="min-h-dvh bg-neutral-100 py-6 print:bg-white print:py-0">{children}</div>;
}
