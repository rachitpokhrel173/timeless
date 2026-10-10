import type { Metadata } from "next";
import { ToastProvider } from "@/components/admin/interactive";

export const metadata: Metadata = {
  title: { default: "Your events", template: "%s · Timeless Ties" },
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/** Client portal shell (light theme, shared admin UI tokens). */
export default function ClientLayout({ children }: LayoutProps<"/client">) {
  return (
    <div className="admin-root flex min-h-dvh flex-1 flex-col bg-a-bg font-sans text-[14px] text-a-text" data-pref="light" data-theme="light">
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
