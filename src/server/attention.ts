import "server-only";
import { adminDb, many, schema, tbl } from "@/db";
import type { Permission } from "@/lib/auth/permissions";
import { npr, todayISO } from "@/lib/format";
import { inventoryWithStock } from "./inventory";

export type AttentionKind = "inquiry" | "uncontacted" | "unconfirmed" | "unpaid" | "stale_quote" | "overdue_invoice" | "low_stock";
export type AttentionItem = { id: string; kind: AttentionKind; title: string; detail: string; href: string; urgent: boolean };

const DAY = 86_400_000;
const daysSince = (ts: string) => Math.floor((Date.now() - Date.parse(ts)) / DAY);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const when = (d: number) => (d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);
const pretty = (s: string | null) => (s ?? "event").replace(/-/g, " ");

/**
 * Today's to-do list for the dashboard: things that slip if nobody acts — unanswered inquiries,
 * leads nobody has called, events this week that aren't confirmed or paid, quotations with no
 * reply, overdue invoices and low stock. Urgent items first; each check needs its permission.
 */
export async function attentionItems(has: (p: Permission) => boolean): Promise<AttentionItem[]> {
  const today = todayISO();
  const inAWeek = todayISO(7);
  const dayAgo = new Date(Date.now() - DAY).toISOString();
  const fiveDaysAgo = new Date(Date.now() - 5 * DAY).toISOString();

  const [inquiries, leads, events, quotes, invoices, lowStock] = await Promise.all([
    has("leads.view")
      ? many<{ id: string; name: string; createdAt: string }>(adminDb.from(tbl(schema.inquiries)).select("id,name,createdAt:created_at").eq("status", "NEW").eq("spam", false).is("archived_at", null).order("created_at"))
      : [],
    has("leads.view")
      ? many<{ id: string; name: string; phone: string | null; eventType: string | null; createdAt: string }>(
          adminDb
            .from(tbl(schema.leads))
            .select("id,name,phone,eventType:event_type,createdAt:created_at")
            .eq("stage", "NEW")
            .is("last_contact_at", null)
            .is("archived_at", null)
            .is("deleted_at", null)
            .lte("created_at", dayAgo)
            .order("created_at")
            .limit(10),
        )
      : [],
    has("bookings.view")
      ? many<{ id: string; title: string; eventType: string | null; eventDate: string; b: { id: string; number: string; status: string; totalAmount: number; amountPaid: number } }>(
          adminDb
            .from(tbl(schema.events))
            .select("id,title,eventType:event_type,eventDate:event_date,b:bookings!inner(id,number,status,totalAmount:total_amount,amountPaid:amount_paid)")
            .gte("event_date", today)
            .lte("event_date", inAWeek)
            .not("status", "in", "(CANCELLED,COMPLETED)")
            .is("archived_at", null)
            .order("event_date"),
        )
      : [],
    has("quotations.view")
      ? many<{ id: string; number: string; sentAt: string; c: { name: string } | null }>(
          adminDb.from(tbl(schema.quotations)).select("id,number,sentAt:sent_at,c:customers(name)").in("status", ["SENT", "VIEWED"]).lte("sent_at", fiveDaysAgo).is("deleted_at", null).order("sent_at").limit(10),
        )
      : [],
    has("invoices.view")
      ? many<{ id: string; number: string; dueDate: string; total: number; amountPaid: number; c: { name: string } | null }>(
          adminDb
            .from(tbl(schema.invoices))
            .select("id,number,dueDate:due_date,total,amountPaid:amount_paid,c:customers(name)")
            .in("status", ["SENT", "PARTIALLY_PAID", "OVERDUE"])
            .lt("due_date", today)
            .order("due_date")
            .limit(10),
        )
      : [],
    has("inventory.view") ? inventoryWithStock().then((items) => items.filter((i) => i.low)) : [],
  ]);

  const items: AttentionItem[] = [];

  if (inquiries.length) {
    const names = inquiries.slice(0, 3).map((i) => i.name).join(", ") + (inquiries.length > 3 ? ` +${inquiries.length - 3} more` : "");
    items.push({
      id: "inquiries",
      kind: "inquiry",
      title: `${inquiries.length} new website inquir${inquiries.length === 1 ? "y" : "ies"}`,
      detail: `${names} — reply and update the status`,
      href: inquiries.length === 1 ? `/admin/inquiries/${inquiries[0]!.id}` : "/admin/inquiries",
      urgent: daysSince(inquiries[0]!.createdAt) >= 1,
    });
  }

  for (const l of leads) {
    const d = daysSince(l.createdAt);
    items.push({
      id: `lead-${l.id}`,
      kind: "uncontacted",
      title: `Contact ${l.name}`,
      detail: `New ${pretty(l.eventType)} lead waiting ${plural(d, "day")}${l.phone ? ` · ${l.phone}` : ""}`,
      href: `/admin/leads/${l.id}`,
      urgent: d >= 3,
    });
  }

  for (const e of events) {
    const d = daysBetween(today, e.eventDate);
    if (e.b.status === "PENDING") {
      items.push({ id: `unconfirmed-${e.id}`, kind: "unconfirmed", title: `${e.title} is ${when(d)}`, detail: `Booking ${e.b.number} is still pending — confirm or update it`, href: `/admin/bookings/${e.b.id}`, urgent: d <= 2 });
    } else if (has("payments.view") && e.b.amountPaid < e.b.totalAmount) {
      items.push({
        id: `unpaid-${e.id}`,
        kind: "unpaid",
        title: `Collect payment for ${e.title}`,
        detail: `${pretty(e.eventType)} ${when(d)} · ${npr(e.b.totalAmount - e.b.amountPaid)} still due`,
        href: `/admin/bookings/${e.b.id}?tab=payments`,
        urgent: d <= 2,
      });
    }
  }

  for (const q of quotes) {
    const d = daysSince(q.sentAt);
    items.push({ id: `quote-${q.id}`, kind: "stale_quote", title: `Follow up on ${q.number}`, detail: `Sent to ${q.c?.name ?? "the client"} ${plural(d, "day")} ago — no reply yet`, href: `/admin/quotations/${q.id}`, urgent: d >= 10 });
  }

  for (const inv of invoices) {
    const due = inv.total - inv.amountPaid;
    if (due <= 0) continue;
    const late = daysBetween(inv.dueDate, today);
    items.push({ id: `invoice-${inv.id}`, kind: "overdue_invoice", title: `${inv.number} is overdue`, detail: `${inv.c?.name ?? "Client"} owes ${npr(due)} · ${plural(late, "day")} late`, href: `/admin/invoices/${inv.id}`, urgent: true });
  }

  if (lowStock.length) {
    const names = lowStock.slice(0, 3).map((i) => `${i.name} (${i.available})`).join(", ") + (lowStock.length > 3 ? ` +${lowStock.length - 3} more` : "");
    items.push({ id: "low-stock", kind: "low_stock", title: `${plural(lowStock.length, "inventory item")} running low`, detail: names, href: "/admin/inventory?stock=low", urgent: false });
  }

  // Urgent first; otherwise keep the grouping above
  return items.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}
