import type { Permission } from "@/lib/auth/permissions";

export const WIDGETS = [
  { key: "kpis", label: "Key figures" },
  { key: "revenue", label: "Revenue chart", permission: "payments.view" },
  { key: "conversion", label: "Lead conversion", permission: "leads.view" },
  { key: "pipeline", label: "Sales pipeline", permission: "leads.view" },
  { key: "upcoming", label: "Upcoming events", permission: "events.view" },
  { key: "inquiries", label: "Recent inquiries", permission: "leads.view" },
  { key: "followups", label: "Pending follow-ups", permission: "leads.view" },
  { key: "inventory", label: "Inventory alerts", permission: "inventory.view" },
  { key: "payments", label: "Recent payments", permission: "payments.view" },
  { key: "outstanding", label: "Outstanding payments", permission: "payments.view" },
  { key: "activity", label: "Recent activity", permission: "audit.view" },
] as const satisfies readonly { key: string; label: string; permission?: Permission }[];

export type WidgetKey = (typeof WIDGETS)[number]["key"];
export const DEFAULT_WIDGETS: WidgetKey[] = ["kpis", "revenue", "conversion", "pipeline", "upcoming", "inquiries", "followups", "inventory", "payments", "outstanding", "activity"];
