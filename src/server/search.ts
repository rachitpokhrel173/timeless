import "server-only";
import { db, many, pgrstValue, withUser } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { likeTerm } from "@/lib/list";
import type { SearchHit } from "@/components/admin/CommandPalette";

const LIMIT = 5;

/** Rows matching either query, newest first, without duplicates. */
async function merged<R extends { id: string; createdAt?: Date }>(...queries: PromiseLike<R[]>[]) {
  const seen = new Map<string, R>();
  for (const rows of await Promise.all(queries)) for (const r of rows) seen.set(r.id, r);
  return [...seen.values()].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)).slice(0, LIMIT);
}

/**
 * Search everything the user may see. Runs as the signed-in user, so Row Level Security decides
 * which tables return rows — the permission checks below only skip queries that would come
 * back empty anyway.
 */
export async function globalSearch(user: SessionUser, query: string): Promise<SearchHit[]> {
  const term = pgrstValue(likeTerm(query.trim().slice(0, 80)));
  const like = (...columns: string[]) => columns.map((c) => `${c}.ilike.${term}`).join(",");
  const has = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);

  return withUser(async () => {
    const hits: SearchHit[] = [];
    if (has("customers.view")) {
      const rows = await many<{ id: string; name: string; phone: string | null; email: string | null }>(
        db
          .from("customers")
          .select("id,name,phone,email")
          .is("deleted_at", null)
          .or(like("name", "phone", "email"))
          .order("created_at", { ascending: false })
          .limit(LIMIT),
      );
      hits.push(...rows.map((r) => ({ type: "Customer", id: r.id, title: r.name, subtitle: r.phone ?? r.email ?? undefined, href: `/admin/customers/${r.id}` })));
    }
    if (has("leads.view")) {
      const leads = await many<{ id: string; name: string; number: string; stage: string }>(
        db
          .from("leads")
          .select("id,name,number,stage")
          .is("deleted_at", null)
          .or(like("name", "phone", "email", "number"))
          .order("created_at", { ascending: false })
          .limit(LIMIT),
      );
      hits.push(...leads.map((r) => ({ type: "Lead", id: r.id, title: r.name, subtitle: `${r.number} · ${r.stage.toLowerCase()}`, href: `/admin/leads/${r.id}` })));
      const inquiries = await many<{ id: string; name: string; number: string; status: string }>(
        db
          .from("inquiries")
          .select("id,name,number,status")
          .eq("spam", false)
          .or(like("name", "phone", "number"))
          .order("created_at", { ascending: false })
          .limit(LIMIT),
      );
      hits.push(...inquiries.map((r) => ({ type: "Inquiry", id: r.id, title: `${r.number} — ${r.name}`, subtitle: r.status.toLowerCase(), href: `/admin/inquiries/${r.id}` })));
    }
    if (has("quotations.view")) {
      type Q = { id: string; number: string; title: string; createdAt: Date; customer: { name: string } };
      const select = "id,number,title,createdAt:created_at,customer:customers!inner(name)";
      const rows = await merged(
        many<Q>(db.from("quotations").select(select).is("deleted_at", null).or(like("number", "title")).order("created_at", { ascending: false }).limit(LIMIT)),
        many<Q>(
          db
            .from("quotations")
            .select(select)
            .is("deleted_at", null)
            .ilike("customer.name", likeTerm(query.trim().slice(0, 80)))
            .order("created_at", { ascending: false })
            .limit(LIMIT),
        ),
      );
      hits.push(...rows.map((r) => ({ type: "Quotation", id: r.id, title: `${r.number} — ${r.title}`, subtitle: r.customer.name, href: `/admin/quotations/${r.id}` })));
    }
    if (has("bookings.view")) {
      type B = { id: string; number: string; createdAt: Date; customer: { name: string }; events: { title: string }[] };
      const select = (eventsInner = false) => `id,number,createdAt:created_at,customer:customers!inner(name),events${eventsInner ? "!inner" : ""}(title)`;
      const raw = likeTerm(query.trim().slice(0, 80));
      const rows = await merged(
        many<B>(db.from("bookings").select(select()).ilike("number", raw).order("created_at", { ascending: false }).limit(LIMIT)),
        many<B>(db.from("bookings").select(select()).ilike("customer.name", raw).order("created_at", { ascending: false }).limit(LIMIT)),
        many<B>(db.from("bookings").select(select(true)).ilike("events.title", raw).order("created_at", { ascending: false }).limit(LIMIT)),
      );
      hits.push(
        ...rows.map((r) => ({
          type: "Booking",
          id: r.id,
          title: `${r.number} — ${r.events[0]?.title ?? r.customer.name}`,
          subtitle: r.customer.name,
          href: `/admin/bookings/${r.id}`,
        })),
      );
    }
    if (has("events.view")) {
      const rows = await many<{ id: string; title: string; date: string; venue: string | null }>(
        db.from("events").select("id,title,date:event_date,venue").or(like("title", "venue")).order("event_date", { ascending: false }).limit(LIMIT),
      );
      hits.push(...rows.map((r) => ({ type: "Event", id: r.id, title: r.title, subtitle: [r.date, r.venue].filter(Boolean).join(" · "), href: `/admin/events/${r.id}` })));
    }
    if (has("invoices.view")) {
      type I = { id: string; number: string; status: string; createdAt: Date; customer: { name: string } };
      const select = "id,number,status,createdAt:created_at,customer:customers!inner(name)";
      const raw = likeTerm(query.trim().slice(0, 80));
      const rows = await merged(
        many<I>(db.from("invoices").select(select).ilike("number", raw).order("created_at", { ascending: false }).limit(LIMIT)),
        many<I>(db.from("invoices").select(select).ilike("customer.name", raw).order("created_at", { ascending: false }).limit(LIMIT)),
      );
      hits.push(
        ...rows.map((r) => ({
          type: "Invoice",
          id: r.id,
          title: r.number,
          subtitle: `${r.customer.name} · ${r.status.toLowerCase().replace("_", " ")}`,
          href: `/admin/invoices/${r.id}`,
        })),
      );
    }
    if (has("inventory.view")) {
      const rows = await many<{ id: string; name: string; sku: string }>(
        db.from("inventory_items").select("id,name,sku").is("archived_at", null).or(like("name", "sku")).limit(LIMIT),
      );
      hits.push(...rows.map((r) => ({ type: "Inventory", id: r.id, title: r.name, subtitle: r.sku, href: `/admin/inventory/${r.id}` })));
    }
    if (has("vendors.view")) {
      const rows = await many<{ id: string; name: string; category: string }>(
        db
          .from("vendors")
          .select("id,name,category")
          .is("archived_at", null)
          .or(like("name", "contact_person", "phone"))
          .limit(LIMIT),
      );
      hits.push(...rows.map((r) => ({ type: "Vendor", id: r.id, title: r.name, subtitle: r.category.toLowerCase(), href: `/admin/vendors/${r.id}` })));
    }
    if (has("staff.view")) {
      const rows = await many<{ id: string; name: string; role: string | null }>(
        db.from("staff").select("id,name,role").is("archived_at", null).or(like("name", "phone")).limit(LIMIT),
      );
      hits.push(...rows.map((r) => ({ type: "Staff", id: r.id, title: r.name, subtitle: r.role ?? undefined, href: `/admin/staff/${r.id}` })));
    }
    return hits;
  });
}
