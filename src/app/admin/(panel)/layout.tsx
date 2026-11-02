import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import { isFieldOnly, requirePage } from "@/lib/auth/session";
import { PATH_HEADER } from "@/lib/path-header";
import { headerCounts } from "@/server/counts";
import EmailLinkForwarder from "../(auth)/EmailLinkForwarder";

// Every admin page depends on the signed-in user — never prerender or cache
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePage();
  // The field team works from the staff portal, never the back office
  if (isFieldOnly(user)) redirect(portalPath((await headers()).get(PATH_HEADER)));
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

/** The staff-portal page matching an admin path (task links in emails and notifications keep working). */
function portalPath(path: string | null) {
  const task = path?.match(/^\/admin\/my-work\/([0-9a-f-]{36})$/i);
  if (task) return `/staff/tasks/${task[1]}`;
  if (path === "/admin/notifications") return "/staff/notifications";
  if (path === "/admin/account") return "/staff/account";
  return "/staff";
}
