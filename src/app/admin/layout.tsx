import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/admin/pwa";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Timeless Ties Admin" },
  robots: { index: false, follow: false },
  // Replaces the site's manifest link; the tags browsers need for installing are rendered below
  manifest: "/admin.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#151715" },
  ],
};

// Applies the "system" theme before paint so dark-mode users don't see a light flash
const themeScript = `(function(){try{var r=document.currentScript.parentElement;if(r.dataset.pref==="system"){r.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}}catch(e){}})()`;

// Chrome can fire beforeinstallprompt before the app's scripts load; keep it for useInstall() to pick up
const installScript = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__installPrompt=e})`;

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
      {/* Installable as its own app (see app/admin.webmanifest and public/admin-sw.js). Rendered here rather
          than through `metadata`: production streams metadata into <body>, where Chrome ignores the manifest
          link and reports "This app cannot be installed". React hoists these tags into <head>. */}
      <link rel="manifest" href="/admin.webmanifest" />
      <link rel="apple-touch-icon" href="/apple-icon.png" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="TT Admin" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <script dangerouslySetInnerHTML={{ __html: installScript }} />
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <ServiceWorker />
      {children}
    </div>
  );
}
