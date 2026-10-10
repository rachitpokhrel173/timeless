/**
 * Every permission in the system. The same keys are seeded into the `permissions` table
 * (supabase/migrations/00002_profiles_roles.sql) and checked in two places:
 *   - in the database, by RLS policies via public.has_permission(key)
 *   - in server code, before any action runs (defence in depth)
 * Keep this list and the migration in sync.
 */
export const PERMISSIONS = {
  "dashboard.view": { group: "Overview", label: "View dashboard" },

  "leads.view": { group: "Sales", label: "View leads, inquiries & follow-ups" },
  "leads.create": { group: "Sales", label: "Create leads" },
  "leads.update": { group: "Sales", label: "Update leads, inquiries & follow-ups" },
  "leads.delete": { group: "Sales", label: "Delete leads & inquiries" },

  "customers.view": { group: "Customers", label: "View customers" },
  "customers.create": { group: "Customers", label: "Create customers" },
  "customers.update": { group: "Customers", label: "Update customers" },
  "customers.delete": { group: "Customers", label: "Delete customers" },

  "quotations.view": { group: "Quotations", label: "View quotations" },
  "quotations.create": { group: "Quotations", label: "Create quotations" },
  "quotations.update": { group: "Quotations", label: "Edit & send quotations" },
  "quotations.delete": { group: "Quotations", label: "Delete quotations" },
  "quotations.approve": { group: "Quotations", label: "Approve quotations & convert to bookings" },

  "bookings.view": { group: "Bookings", label: "View bookings" },
  "bookings.create": { group: "Bookings", label: "Create bookings" },
  "bookings.update": { group: "Bookings", label: "Update bookings" },
  "bookings.cancel": { group: "Bookings", label: "Cancel bookings" },

  "events.view": { group: "Events", label: "View events, calendar & tasks" },
  "events.create": { group: "Events", label: "Create events" },
  "events.update": { group: "Events", label: "Plan events: team, vendors, timeline, designs" },
  "events.delete": { group: "Events", label: "Delete events" },
  "tasks.update": { group: "Events", label: "Update tasks assigned to the team" },

  "inventory.view": { group: "Inventory", label: "View inventory" },
  "inventory.create": { group: "Inventory", label: "Add inventory items" },
  "inventory.update": { group: "Inventory", label: "Edit inventory items & packages" },
  "inventory.adjust": { group: "Inventory", label: "Adjust stock & reservations" },

  "vendors.view": { group: "Vendors", label: "View vendors" },
  "vendors.manage": { group: "Vendors", label: "Manage vendors & vendor bookings" },

  "staff.view": { group: "Staff", label: "View staff & availability" },
  "staff.manage": { group: "Staff", label: "Manage staff & availability" },

  "invoices.view": { group: "Finance", label: "View invoices" },
  "invoices.create": { group: "Finance", label: "Create invoices" },
  "invoices.update": { group: "Finance", label: "Edit, send & cancel invoices" },
  "payments.view": { group: "Finance", label: "View payments" },
  "payments.create": { group: "Finance", label: "Record & void payments" },
  "expenses.view": { group: "Finance", label: "View expenses & profitability" },
  "expenses.create": { group: "Finance", label: "Record expenses & vendor payments" },

  "documents.view": { group: "Documents", label: "View private documents" },
  "documents.manage": { group: "Documents", label: "Upload & share documents" },

  "reports.view": { group: "Reports", label: "View reports & analytics" },
  "marketing.manage": { group: "Reports", label: "Manage campaigns, sources & coupons" },

  "cms.view": { group: "Website", label: "View website content" },
  "cms.manage": { group: "Website", label: "Edit website content, gallery & media" },

  "settings.manage": { group: "System", label: "Business settings, automations & backups" },
  "users.manage": { group: "System", label: "Manage users & roles" },
  "audit.view": { group: "System", label: "View activity logs & security" },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

const all = (prefix: string) => ALL_PERMISSIONS.filter((p) => p.startsWith(prefix));

/** Built-in roles (seeded by migration; admins can adjust them afterwards). */
export const DEFAULT_ROLES: { key: string; name: string; description: string; permissions: Permission[] }[] = [
  { key: "SUPER_ADMIN", name: "Super Admin", description: "Full access, including granting Super Admin.", permissions: ALL_PERMISSIONS },
  {
    key: "ADMIN",
    name: "Admin",
    description: "Runs the business day to day. Everything except creating Super Admins.",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "MANAGER",
    name: "Manager",
    description: "Sales, events, inventory and finance — no users, roles or system settings.",
    permissions: ALL_PERMISSIONS.filter((p) => !["users.manage", "settings.manage", "audit.view"].includes(p)),
  },
  {
    key: "SALES",
    name: "Sales",
    description: "Leads, customers, quotations and new bookings.",
    permissions: [
      "dashboard.view",
      ...all("leads."),
      "customers.view",
      "customers.create",
      "customers.update",
      "quotations.view",
      "quotations.create",
      "quotations.update",
      "bookings.view",
      "bookings.create",
      "events.view",
      "inventory.view",
      "documents.view",
      "marketing.manage",
      "reports.view",
    ],
  },
  {
    key: "EVENT_MANAGER",
    name: "Event Manager",
    description: "Plans and runs events: schedules, tasks, inventory, vendors and the team.",
    permissions: [
      "dashboard.view",
      "customers.view",
      "bookings.view",
      "bookings.update",
      ...all("events."),
      "tasks.update",
      ...all("inventory."),
      ...all("vendors."),
      ...all("staff."),
      "documents.view",
      "documents.manage",
    ],
  },
  {
    key: "ACCOUNTANT",
    name: "Accountant",
    description: "Invoices, payments, expenses and financial reports.",
    permissions: [
      "dashboard.view",
      "customers.view",
      "bookings.view",
      "events.view",
      "vendors.view",
      ...all("invoices."),
      ...all("payments."),
      ...all("expenses."),
      "documents.view",
      "documents.manage",
      "reports.view",
    ],
  },
  {
    key: "EDITOR",
    name: "Website Editor",
    description: "Website content, gallery, media, testimonials and SEO.",
    permissions: ["dashboard.view", "cms.view", "cms.manage"],
  },
  {
    key: "STAFF",
    name: "Staff",
    description: "Sees events, the calendar and their tasks; can update tasks.",
    permissions: ["dashboard.view", "events.view", "tasks.update", "inventory.view"],
  },
];
