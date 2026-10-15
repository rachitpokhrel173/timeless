import AdminShell from "@/components/admin/AdminShell";
import { requirePage } from "@/lib/auth/session";
import { headerCounts } from "@/server/counts";
import EmailLinkForwarder from "../(auth)/EmailLinkForwarder";

// Every admin page depends on the signed-in user — never prerender or cache
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePage();
  const counts = await headerCounts(user);
  return (
    <AdminShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        roleName: user.roleName,
        permissions: [...user.permissions],
        theme: user.prefs.theme ?? "system",
        collapsed: !!user.prefs.sidebarCollapsed,
      }}
      initialCounts={counts}
    >
      {/* An invitation opened while already signed in still lands on the password step */}
      <EmailLinkForwarder />
      {children}
    </AdminShell>
  );
}
