import Image from "next/image";
import Link from "next/link";
import { Bell, ClipboardList, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { requireStaffUser } from "@/server/staff-portal";
import { unreadCount } from "@/server/notifications";
import EmailLinkForwarder from "@/app/admin/(auth)/EmailLinkForwarder";
import { staffLogout } from "../actions";

// Everything here depends on the signed-in team member — never prerender or cache
export const dynamic = "force-dynamic";

export default async function StaffPortalLayout({ children }: LayoutProps<"/staff">) {
  const user = await requireStaffUser();
  const unread = await unreadCount(user);
  // Back-office users who also do field work can jump back to the admin
  const office = [...user.permissions].some((p) => p !== "tasks.update" && p !== "dashboard.view");
  const link = "flex flex-col items-center gap-0.5 rounded-md px-2.5 py-1.5 text-[11px] text-a-muted hover:bg-a-hover hover:text-a-text sm:flex-row sm:gap-1.5 sm:text-[13px]";

  return (
    <div className="flex min-h-dvh flex-col bg-a-bg text-a-text">
      <EmailLinkForwarder />
      <header className="sticky top-0 z-30 border-b border-a-border bg-a-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2">
          <Link href="/staff" className="mr-auto flex items-center gap-2" aria-label="My work — staff portal home">
            <Image src="/brand/logo-wine.png" alt="" width={34} height={31} className="rounded bg-white/90 p-0.5" />
            <span className="hidden leading-tight sm:block">
              <span className="block font-serif text-[15px] font-medium">Timeless Ties</span>
              <span className="block text-[11px] tracking-wide text-a-muted uppercase">Team portal</span>
            </span>
          </Link>
          <nav aria-label="Staff portal" className="flex items-center gap-0.5">
            <Link href="/staff" className={link}>
              <ClipboardList className="size-4" aria-hidden /> My work
            </Link>
            <Link href="/staff/notifications" className={`${link} relative`}>
              <Bell className="size-4" aria-hidden /> Alerts
              {unread > 0 && (
                <span className="absolute top-0.5 right-1 min-w-4 rounded-full bg-a-accent px-1 text-center text-[10px] leading-4 font-semibold text-a-on-accent sm:static sm:ml-0.5">
                  {unread > 99 ? "99+" : unread}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
            <Link href="/staff/account" className={link}>
              <UserRound className="size-4" aria-hidden /> Account
            </Link>
            {office && (
              <Link href="/admin" className={link}>
                <LayoutDashboard className="size-4" aria-hidden /> Admin
              </Link>
            )}
            <form action={staffLogout}>
              <button type="submit" className={link}>
                <LogOut className="size-4" aria-hidden /> Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5">{children}</main>
      <footer className="py-4 text-center text-[11px] text-a-muted">Signed in as {user.name}</footer>
    </div>
  );
}
