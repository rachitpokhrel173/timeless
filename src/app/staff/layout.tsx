import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/admin/interactive";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "Staff", template: "%s · Timeless Ties Staff" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#151715" },
  ],
};

// Applies the "system" theme before paint so dark-mode users don't see a light flash
const themeScript = `(function(){try{var r=document.currentScript.parentElement;if(r.dataset.pref==="system"){r.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}}catch(e){}})()`;

/** The staff portal shares the admin design tokens (.admin-root) but none of the back-office shell. */
export default async function StaffRootLayout({ children }: LayoutProps<"/staff">) {
  const user = await getCurrentUser();
  const pref = user?.prefs.theme ?? "system";
  return (
    <div className="admin-root flex min-h-dvh flex-1 flex-col font-sans text-[14px]" data-pref={pref} data-theme={pref === "dark" ? "dark" : "light"} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
