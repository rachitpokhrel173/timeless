import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/admin/pwa";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Timeless Ties Admin" },
  robots: { index: false, follow: false },
  // Installable as its own app (see app/admin.webmanifest and public/admin-sw.js)
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "TT Admin", statusBarStyle: "default" },
  icons: { apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#151715" },
  ],
};

// Applies the "system" theme before paint so dark-mode users don't see a light flash
const themeScript = `(function(){try{var r=document.currentScript.parentElement;if(r.dataset.pref==="system"){r.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}}catch(e){}})()`;

export default async function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  const pref = user?.prefs.theme ?? "system";
  return (
    <div
      className="admin-root flex min-h-dvh flex-1 flex-col font-sans text-[14px]"
      data-pref={pref}
      data-theme={pref === "dark" ? "dark" : "light"}
      suppressHydrationWarning
    >
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <ServiceWorker />
      {children}
    </div>
  );
}
