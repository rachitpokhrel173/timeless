"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarCheck,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Download,
  ExternalLink,
  FilePlus2,
  Inbox,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Plus,
  Search,
  Sun,
  UserCircle,
  UserPlus,
  X,
} from "lucide-react";
import { logout } from "@/app/admin/(auth)/login/actions";
import { setSidebarCollapsed, setThemePreference } from "@/app/admin/(panel)/account/actions";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import CommandPalette from "./CommandPalette";
import { ToastProvider, useToast } from "./interactive";
import { allowed, NAV } from "./nav";
import InstallSteps from "./InstallSteps";
import { useInstall } from "./pwa";

export type ShellUser = { id: string; name: string; email: string; roleName: string; permissions: string[]; theme: "light" | "dark" | "system"; collapsed: boolean };
type Counts = { notifications: number; inquiries: number };

/**
 * Badge counts. Supabase Realtime pushes new notifications/inquiries instantly (RLS decides what
 * this user may receive); a slow poll is the fallback when Realtime isn't available.
 */
function useCounts(initial: Counts, onNew: (title: string) => void) {
  const [counts, setCounts] = useState(initial);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/counts", { cache: "no-store" });
      if (res.ok) setCounts(await res.json());
    } catch {
      /* offline — keep last known counts */
    }
  }, []);

  useEffect(() => {
    const tick = () => !document.hidden && refresh();
    const id = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    let cleanup = () => {};
    if (supabaseConfigured()) {
      const supabase = supabaseBrowser();
      const channel = supabase
        .channel("admin-feed")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload: { new: Record<string, unknown> }) => {
          const title = (payload.new as { title?: string }).title;
          if (title) onNew(title);
          refresh();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "inquiries" }, () => refresh())
        .subscribe();
      cleanup = () => void supabase.removeChannel(channel);
    }
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      cleanup();
    };
  }, [refresh, onNew]);
  return counts;
}

function isActive(pathname: string, href: string, match: string[] = []) {
  const path = href.split("?")[0];
  if (path === "/admin") return pathname === "/admin";
  return [path, ...match].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function SidebarNav({ perms, counts, collapsed, onNavigate }: { perms: Set<string>; counts: Counts; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => allowed(i, perms)) })).filter((g) => g.items.length);
  // The most specific match wins (e.g. /admin/website/gallery over /admin/website)
  const active = groups
    .flatMap((g) => g.items)
    .filter((i) => isActive(pathname, i.href, i.match))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Admin" className="flex-1 overflow-x-visible overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
      {groups.map((group, gi) => (
        <div key={group.label} className={cn(gi > 0 && "mt-4")}>
          {collapsed ? (
            gi > 0 && <div className="mx-3 mb-3 border-t border-side-border" aria-hidden />
          ) : (
            <p className="px-2.5 pb-1.5 text-[10.5px] font-semibold tracking-[0.14em] text-side-muted uppercase">{group.label}</p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isOn = item.href === active;
              const count = item.badge ? counts[item.badge] : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isOn ? "page" : undefined}
                    className={cn(
                      "group/side relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150",
                      isOn ? "bg-side-active-bg font-medium text-side-active" : "text-side-text hover:bg-side-hover hover:text-white",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    {isOn && <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-side-active" aria-hidden />}
                    <item.icon className={cn("size-[17px] shrink-0", isOn ? "text-side-active" : "text-side-muted group-hover/side:text-side-text")} strokeWidth={1.75} aria-hidden />
                    {collapsed ? <span className="side-tip">{item.label}</span> : <span className="truncate">{item.label}</span>}
                    {collapsed && <span className="sr-only">{item.label}</span>}
                    {count > 0 && (
                      <span className={cn("rounded-full bg-side-active px-1.5 text-[10px] leading-4 font-semibold text-black", collapsed ? "absolute top-0 right-1" : "ml-auto")}>
                        {count > 99 ? "99+" : count}
                        <span className="sr-only"> new</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/admin" className={cn("flex items-center gap-2.5", collapsed ? "justify-center" : "px-2")} aria-label="Timeless Ties admin home">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#f5efe4]">
        <Image src="/brand/logo-wine.png" alt="" width={26} height={24} />
      </span>
      {!collapsed && (
        <span className="leading-tight">
          <span className="block font-serif text-[16px] text-[#f4efe6]">Timeless Ties</span>
          <span className="block text-[9.5px] tracking-[0.2em] text-side-muted uppercase">Events · Studio</span>
        </span>
      )}
    </Link>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function QuickAdd({ perms }: { perms: Set<string> }) {
  const { open, setOpen, ref } = usePopover();
  const items = [
    { href: "/admin/inquiries/new", label: "New inquiry", icon: Inbox, perm: "leads.create" },
    { href: "/admin/leads/new", label: "New lead", icon: UserPlus, perm: "leads.create" },
    { href: "/admin/customers/new", label: "New customer", icon: UserCircle, perm: "customers.create" },
    { href: "/admin/quotations/new", label: "New quotation", icon: FilePlus2, perm: "quotations.create" },
    { href: "/admin/bookings/new", label: "New booking", icon: CalendarCheck, perm: "bookings.create" },
  ].filter((i) => perms.has(i.perm));
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-md bg-a-accent px-3 text-[13px] font-medium text-a-on-accent transition-opacity duration-150 hover:opacity-90"
      >
        <Plus className="size-4" aria-hidden />
        <span className="hidden sm:inline">New</span>
        <span className="sr-only sm:hidden">Create new</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-52 rounded-lg border border-a-border bg-a-surface p-1 shadow-lg">
          {items.map((i) => (
            <Link key={i.href} role="menuitem" href={i.href} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] hover:bg-a-hover">
              <i.icon className="size-4 text-a-muted" aria-hidden />
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Header button to install the admin as an app; phones without an install prompt get the steps instead. */
function InstallButton() {
  const { mode, install } = useInstall();
  const { open, setOpen, ref } = usePopover();
  if (!mode) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (mode === "prompt" ? void install() : setOpen((o) => !o))}
        aria-expanded={mode === "prompt" ? undefined : open}
        className="flex h-9 items-center gap-1.5 rounded-md border border-a-border px-2.5 text-[13px] font-medium text-a-text transition-colors duration-150 hover:bg-a-hover"
      >
        <Download className="size-4 text-a-muted" aria-hidden />
        Install<span className="hidden sm:inline"> app</span>
      </button>
      {open && mode !== "prompt" && (
        <div className="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-a-border bg-a-surface p-3 shadow-lg">
          <p className="mb-1.5 text-[13px] font-medium">Install the admin app</p>
          <InstallSteps mode={mode} />
        </div>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const { open, setOpen, ref } = usePopover();
  const [theme, setTheme] = useState(user.theme);
  const applyTheme = (t: ShellUser["theme"]) => {
    setTheme(t);
    const root = document.querySelector<HTMLElement>(".admin-root");
    if (root) {
      root.dataset.pref = t;
      root.dataset.theme = t === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : t;
    }
    void setThemePreference({ theme: t });
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex h-9 items-center gap-2 rounded-md px-1.5 hover:bg-a-hover">
        <span className="flex size-7 items-center justify-center rounded-full bg-a-gold-soft text-[11px] font-semibold text-a-gold" aria-hidden>
          {user.name
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0])
            .join("")
            .toUpperCase()}
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-[13px] font-medium">{user.name}</span>
          <span className="block max-w-40 truncate text-[11px] text-a-muted">{user.roleName}</span>
        </span>
        <ChevronDown className="hidden size-3.5 text-a-muted lg:block" aria-hidden />
        <span className="sr-only">Account menu</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-60 rounded-lg border border-a-border bg-a-surface p-1 shadow-lg">
          <div className="border-b border-a-border px-2.5 pt-1.5 pb-2.5">
            <p className="text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-xs text-a-muted">{user.email}</p>
          </div>
          <div className="px-2.5 py-2">
            <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-a-muted uppercase">Theme</p>
            <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Theme">
              {(
                [
                  ["light", Sun, "Light"],
                  ["dark", Moon, "Dark"],
                  ["system", Monitor, "System"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  onClick={() => applyTheme(value)}
                  className={cn("flex flex-col items-center gap-1 rounded-md border py-1.5 text-[11px]", theme === value ? "border-a-accent bg-a-accent-soft text-a-accent" : "border-a-border hover:bg-a-hover")}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Link role="menuitem" href="/admin/account" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] hover:bg-a-hover">
            <UserCircle className="size-4 text-a-muted" aria-hidden />
            My account
          </Link>
          <a role="menuitem" href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] hover:bg-a-hover">
            <ExternalLink className="size-4 text-a-muted" aria-hidden />
            View website
          </a>
          <form action={logout}>
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-a-danger hover:bg-a-danger-soft">
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Shell({ user, initialCounts, children }: { user: ShellUser; initialCounts: Counts; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(user.collapsed);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const toast = useToast();
  const onNew = useCallback((title: string) => toast("success", title), [toast]);
  const counts = useCounts(initialCounts, onNew);
  const pathname = usePathname();
  const router = useRouter();
  const perms = useMemo(() => new Set(user.permissions), [user.permissions]);

  // Close the mobile drawer after navigating
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setDrawer(false);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // Click anywhere on a table row to open it: the row's first link is its record. Buttons,
  // checkboxes, menus and other links keep their own behaviour, and selecting text doesn't navigate.
  useEffect(() => {
    const main = document.getElementById("admin-main");
    if (!main) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("a, button, input, select, textarea, label, summary, dialog, [role='button'], [role='menu'], [role='menuitem'], [contenteditable]")) return;
      const row = target.closest("tbody tr");
      if (!row || !main.contains(row) || window.getSelection()?.toString()) return;
      const link = row.querySelector<HTMLAnchorElement>("a[href^='/']:not([target='_blank'])");
      if (!link) return;
      const href = link.getAttribute("href")!;
      if (e.metaKey || e.ctrlKey) window.open(href, "_blank", "noopener");
      else router.push(href);
    };
    main.addEventListener("click", onClick);
    return () => main.removeEventListener("click", onClick);
  }, [router]);
  // Lock page scroll behind the mobile drawer
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    void setSidebarCollapsed({ collapsed: next });
  };

  return (
    <>
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[90] focus:rounded focus:bg-a-accent focus:px-4 focus:py-2 focus:text-a-on-accent">
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        {/* Desktop / tablet sidebar */}
        <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col bg-side-bg transition-[width] duration-200 md:flex", collapsed ? "w-[60px]" : "w-[232px]")}>
          <div className="flex h-14 items-center border-b border-side-border px-2">
            <Brand collapsed={collapsed} />
          </div>
          <SidebarNav perms={perms} counts={counts} collapsed={collapsed} />
          <div className="border-t border-side-border p-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn("group/side relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-side-muted transition-colors duration-150 hover:bg-side-hover hover:text-side-text", collapsed && "justify-center px-0")}
            >
              {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <ChevronsLeft className="size-4" aria-hidden />}
              {collapsed ? <span className="side-tip">Expand</span> : "Collapse"}
            </button>
          </div>
        </aside>

        {/* Mobile drawer */}
        <div className={cn("fixed inset-0 z-50 md:hidden", drawer ? "visible" : "invisible")} aria-hidden={!drawer}>
          <button type="button" tabIndex={drawer ? 0 : -1} className={cn("absolute inset-0 bg-black/50 transition-opacity duration-200", drawer ? "opacity-100" : "opacity-0")} aria-label="Close navigation" onClick={() => setDrawer(false)} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className={cn("relative flex h-full w-72 max-w-[85%] flex-col bg-side-bg shadow-xl transition-transform duration-200", drawer ? "translate-x-0" : "-translate-x-full")}
          >
            <div className="flex h-14 items-center justify-between border-b border-side-border px-2">
              <Brand />
              <button type="button" onClick={() => setDrawer(false)} className="rounded-md p-2 text-side-muted hover:bg-side-hover hover:text-side-text" aria-label="Close navigation">
                <X className="size-5" />
              </button>
            </div>
            {drawer && <SidebarNav perms={perms} counts={counts} collapsed={false} onNavigate={() => setDrawer(false)} />}
          </aside>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-a-border bg-a-surface px-3 md:px-5">
            <button type="button" onClick={() => setDrawer(true)} className="rounded-md p-2 text-a-muted hover:bg-a-hover md:hidden" aria-label="Open navigation" aria-expanded={drawer}>
              <MenuIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setPalette(true)}
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-a-border bg-a-bg px-3 text-left text-[13px] text-a-muted transition-colors duration-150 hover:border-a-strong sm:max-w-md"
            >
              <Search className="size-4 shrink-0" aria-hidden />
              <span className="truncate">Search customers, bookings, invoices…</span>
              <kbd className="ml-auto hidden rounded border border-a-border bg-a-surface px-1.5 text-[11px] font-medium sm:inline">Ctrl K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              <InstallButton />
              <QuickAdd perms={perms} />
              <Link
                href="/admin/notifications"
                className="relative rounded-md p-2 text-a-muted transition-colors duration-150 hover:bg-a-hover hover:text-a-text"
                aria-label={`Notifications${counts.notifications ? `, ${counts.notifications} unread` : ""}`}
              >
                <Bell className="size-5" aria-hidden />
                {counts.notifications > 0 && (
                  <span className="absolute top-1 right-1 min-w-4 rounded-full bg-a-danger px-1 text-center text-[10px] leading-4 font-semibold text-white" aria-hidden>
                    {counts.notifications > 9 ? "9+" : counts.notifications}
                  </span>
                )}
              </Link>
              <UserMenu user={user} />
            </div>
          </header>
          <main id="admin-main" className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-5 md:px-6 md:py-7">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} permissions={user.permissions} onNavigate={(href) => router.push(href)} />
    </>
  );
}

export default function AdminShell(props: { user: ShellUser; initialCounts: Counts; children: ReactNode }) {
  return (
    <ToastProvider>
      <Shell {...props} />
    </ToastProvider>
  );
}
