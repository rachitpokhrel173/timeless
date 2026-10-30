import {
  BarChart3,
  Bell,
  Boxes,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Contact,
  FileText,
  Globe,
  Images,
  Inbox,
  Kanban,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  MessageSquareQuote,
  Package,
  PartyPopper,
  Receipt,
  ScrollText,
  Settings,
  Sparkles,
  Store,
  TrendingDown,
  UserPlus,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Any one of these grants access (checked again on the server). */
  permission?: Permission | Permission[];
  badge?: "notifications" | "inquiries";
  /** Extra path prefixes that should highlight this item. */
  match?: string[];
};
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
      { href: "/admin/notifications", label: "Notifications", icon: Bell, badge: "notifications" },
    ],
  },
  {
    label: "Clients & Sales",
    items: [
      { href: "/admin/leads", label: "Leads", icon: UserPlus, permission: "leads.view", match: ["/admin/follow-ups"] },
      { href: "/admin/inquiries", label: "Inquiries", icon: Inbox, permission: "leads.view", badge: "inquiries" },
      { href: "/admin/pipeline", label: "Pipeline", icon: Kanban, permission: "leads.view" },
      { href: "/admin/customers", label: "Customers", icon: Contact, permission: "customers.view" },
      { href: "/admin/quotations", label: "Quotations", icon: FileText, permission: "quotations.view" },
      { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck, permission: "bookings.view" },
    ],
  },
  {
    label: "Event Management",
    items: [
      { href: "/admin/my-work", label: "My work", icon: ClipboardList, permission: ["events.view", "tasks.update"] },
      { href: "/admin/calendar", label: "Calendar", icon: CalendarDays, permission: "events.view" },
      { href: "/admin/events", label: "Events", icon: PartyPopper, permission: "events.view" },
      { href: "/admin/tasks", label: "Tasks", icon: ListTodo, permission: ["events.view", "tasks.update"] },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/inventory", label: "Inventory", icon: Boxes, permission: "inventory.view" },
      { href: "/admin/vendors", label: "Vendors", icon: Store, permission: "vendors.view" },
      { href: "/admin/staff", label: "Staff", icon: UsersRound, permission: "staff.view" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/invoices", label: "Invoices", icon: Receipt, permission: "invoices.view" },
      { href: "/admin/payments", label: "Payments", icon: Wallet, permission: "payments.view" },
      { href: "/admin/expenses", label: "Expenses", icon: TrendingDown, permission: "expenses.view" },
    ],
  },
  {
    label: "Website",
    items: [
      { href: "/admin/website", label: "Website CMS", icon: Globe, permission: ["cms.view", "cms.manage"], match: ["/admin/media"] },
      { href: "/admin/website/services", label: "Services", icon: Sparkles, permission: ["cms.view", "cms.manage"] },
      { href: "/admin/packages", label: "Packages", icon: Package, permission: ["cms.view", "inventory.view"] },
      { href: "/admin/website/gallery", label: "Gallery", icon: Images, permission: ["cms.view", "cms.manage"] },
      { href: "/admin/website/testimonials", label: "Testimonials", icon: MessageSquareQuote, permission: ["cms.view", "cms.manage"] },
    ],
  },
  {
    label: "Analytics",
    items: [{ href: "/admin/reports", label: "Reports", icon: BarChart3, permission: "reports.view" }],
  },
  {
    label: "System",
    items: [
      { href: "/admin/settings", label: "Settings", icon: Settings, permission: "settings.manage" },
      { href: "/admin/users", label: "Users & Roles", icon: KeyRound, permission: "users.manage" },
      { href: "/admin/activity", label: "Activity Logs", icon: ScrollText, permission: "audit.view" },
    ],
  },
];

export const allowed = (item: NavItem, perms: Set<string>) =>
  !item.permission || (Array.isArray(item.permission) ? item.permission.some((p) => perms.has(p)) : perms.has(item.permission));
