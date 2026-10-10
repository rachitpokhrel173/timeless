import { AlertCircle, Archive, Ban, CheckCircle2, CircleDot, Clock, Eye, FileEdit, Handshake, Hourglass, Send, Sparkles, Trophy, XCircle, type LucideIcon } from "lucide-react";
import { Badge, type Tone } from "./ui";

type StatusDef = { label: string; tone: Tone; icon?: LucideIcon };

export const LEAD_STAGE: Record<string, StatusDef> = {
  NEW: { label: "New", tone: "info", icon: Sparkles },
  CONTACTED: { label: "Contacted", tone: "accent", icon: CircleDot },
  QUALIFIED: { label: "Qualified", tone: "accent", icon: CheckCircle2 },
  QUOTED: { label: "Quoted", tone: "gold", icon: Send },
  NEGOTIATION: { label: "Negotiation", tone: "warning", icon: Handshake },
  CONFIRMED: { label: "Confirmed", tone: "success", icon: CheckCircle2 },
  COMPLETED: { label: "Completed", tone: "neutral", icon: Trophy },
  LOST: { label: "Lost", tone: "danger", icon: XCircle },
};

export const INQUIRY_STATUS: Record<string, StatusDef> = {
  NEW: { label: "New", tone: "info", icon: Sparkles },
  CONTACTED: { label: "Contacted", tone: "accent", icon: CircleDot },
  QUOTED: { label: "Quoted", tone: "gold", icon: Send },
  CONFIRMED: { label: "Confirmed", tone: "success", icon: CheckCircle2 },
  COMPLETED: { label: "Completed", tone: "neutral", icon: Trophy },
  CANCELLED: { label: "Cancelled", tone: "danger", icon: Ban },
};

export const FOLLOWUP_STATUS: Record<string, StatusDef> = {
  PENDING: { label: "Pending", tone: "info", icon: Clock },
  OVERDUE: { label: "Overdue", tone: "danger", icon: AlertCircle },
  COMPLETED: { label: "Completed", tone: "success", icon: CheckCircle2 },
  CANCELLED: { label: "Cancelled", tone: "neutral", icon: Ban },
};

export const CONTENT_STATUS: Record<string, StatusDef> = {
  DRAFT: { label: "Draft", tone: "neutral", icon: FileEdit },
  PUBLISHED: { label: "Published", tone: "success", icon: CheckCircle2 },
  ARCHIVED: { label: "Archived", tone: "neutral", icon: Archive },
};

export const QUOTE_STATUS: Record<string, StatusDef> = {
  DRAFT: { label: "Draft", tone: "neutral", icon: FileEdit },
  SENT: { label: "Sent", tone: "info", icon: Send },
  VIEWED: { label: "Viewed", tone: "accent", icon: Eye },
  ACCEPTED: { label: "Accepted", tone: "success", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", tone: "danger", icon: XCircle },
  EXPIRED: { label: "Expired", tone: "neutral", icon: Hourglass },
};

export const BOOKING_STATUS: Record<string, StatusDef> = {
  PENDING: { label: "Pending", tone: "warning", icon: Clock },
  CONFIRMED: { label: "Confirmed", tone: "success", icon: CheckCircle2 },
  IN_PROGRESS: { label: "In progress", tone: "info", icon: CircleDot },
  COMPLETED: { label: "Completed", tone: "neutral", icon: Trophy },
  CANCELLED: { label: "Cancelled", tone: "danger", icon: Ban },
};

export const EVENT_STATUS: Record<string, StatusDef> = {
  PLANNING: { label: "Planning", tone: "info", icon: FileEdit },
  READY: { label: "Ready", tone: "success", icon: CheckCircle2 },
  IN_PROGRESS: { label: "In progress", tone: "accent", icon: CircleDot },
  COMPLETED: { label: "Completed", tone: "neutral", icon: Trophy },
  CANCELLED: { label: "Cancelled", tone: "danger", icon: Ban },
};

export const TASK_STATUS: Record<string, StatusDef> = {
  TODO: { label: "To do", tone: "neutral", icon: CircleDot },
  IN_PROGRESS: { label: "In progress", tone: "info", icon: Clock },
  COMPLETED: { label: "Completed", tone: "success", icon: CheckCircle2 },
  BLOCKED: { label: "Blocked", tone: "danger", icon: Ban },
};

export const PRIORITY: Record<string, StatusDef> = {
  LOW: { label: "Low", tone: "neutral" },
  MEDIUM: { label: "Medium", tone: "info" },
  HIGH: { label: "High", tone: "warning" },
  URGENT: { label: "Urgent", tone: "danger" },
};

export const INVOICE_STATUS: Record<string, StatusDef> = {
  DRAFT: { label: "Draft", tone: "neutral", icon: FileEdit },
  SENT: { label: "Sent", tone: "info", icon: Send },
  PARTIALLY_PAID: { label: "Partially paid", tone: "warning", icon: Clock },
  PAID: { label: "Paid", tone: "success", icon: CheckCircle2 },
  OVERDUE: { label: "Overdue", tone: "danger", icon: AlertCircle },
  CANCELLED: { label: "Cancelled", tone: "neutral", icon: Ban },
};

export const VENDOR_STATUS: Record<string, StatusDef> = {
  REQUESTED: { label: "Requested", tone: "warning", icon: Clock },
  CONFIRMED: { label: "Confirmed", tone: "success", icon: CheckCircle2 },
  COMPLETED: { label: "Completed", tone: "neutral", icon: Trophy },
  CANCELLED: { label: "Cancelled", tone: "danger", icon: Ban },
};

export const PAY_STATUS: Record<string, StatusDef> = {
  PAID: { label: "Paid", tone: "success", icon: CheckCircle2 },
  PARTIAL: { label: "Partial", tone: "warning", icon: Clock },
  PENDING: { label: "Pending", tone: "danger", icon: Hourglass },
};

export const DESIGN_STATUS: Record<string, StatusDef> = {
  DRAFT: { label: "Draft", tone: "neutral", icon: FileEdit },
  SENT: { label: "Sent to client", tone: "info", icon: Send },
  VIEWED: { label: "Viewed", tone: "accent", icon: Eye },
  APPROVED: { label: "Approved", tone: "success", icon: CheckCircle2 },
  REVISION_REQUESTED: { label: "Revision requested", tone: "danger", icon: FileEdit },
};

/** Vendor categories (vendor_category enum) with display labels. */
export const VENDOR_CATEGORIES = [
  { value: "FLORIST", label: "Florist" },
  { value: "PHOTOGRAPHER", label: "Photographer" },
  { value: "CATERER", label: "Caterer" },
  { value: "LIGHTING", label: "Lighting" },
  { value: "SOUND", label: "Sound / DJ" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "PRINTING", label: "Printing" },
  { value: "FURNITURE", label: "Furniture / tent" },
  { value: "OTHER", label: "Other" },
];

export function StatusBadge({ map, value }: { map: Record<string, StatusDef>; value: string }) {
  const def = map[value] ?? { label: value.toLowerCase().replace(/_/g, " "), tone: "neutral" as Tone };
  return (
    <Badge tone={def.tone} icon={def.icon}>
      {def.label}
    </Badge>
  );
}

export const ArchivedBadge = () => (
  <Badge tone="neutral" icon={Archive}>
    Archived
  </Badge>
);

export const label = (s?: string | null) => (s ? s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");
export const options = (values: readonly string[], map?: Record<string, StatusDef>) => values.map((v) => ({ value: v, label: map?.[v]?.label ?? label(v) }));
