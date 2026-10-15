import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, FileText, LogOut, Palette, Receipt } from "lucide-react";
import { db, many, schema, tbl, withUser } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { fmtDate, npr, titleCase } from "@/lib/format";
import { siteSettings } from "@/data/site";
import { Badge, Card, EmptyState } from "@/components/admin/ui";
import { logout } from "../admin/(auth)/login/actions";
import DesignResponse from "./DesignResponse";

export const metadata: Metadata = { title: "Your events" };

type Quote = { id: string; number: string; title: string; status: string; total: number; eventDate: string | null; publicToken: string };
type Event = { id: string; title: string; eventDate: string; venue: string | null; status: string };
type Design = { id: string; title: string; description: string | null; status: string; eventId: string };
type Invoice = { id: string; number: string; status: string; total: number; amountPaid: number; dueDate: string | null };

/**
 * Client portal home. Every query runs as the signed-in client, so Row Level Security returns only
 * their own quotations, events, designs and invoices (drafts are never visible).
 */
export default async function ClientHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/client/login");
  if (user.isStaff) redirect("/admin");

  const [quotes, events, designs, invoices] = await withUser(() =>
    Promise.all([
      many<Quote>(db.from(tbl(schema.quotations)).select("id,number,title,status,total,eventDate:event_date,publicToken:public_token").order("created_at", { ascending: false }).limit(20)),
      many<Event>(db.from(tbl(schema.events)).select("id,title,eventDate:event_date,venue,status").is("archived_at", null).order("event_date").limit(20)),
      many<Design>(db.from(tbl(schema.designApprovals)).select("id,title,description,status,eventId:event_id").in("status", ["SENT", "VIEWED"]).order("sent_at", { ascending: false })),
      many<Invoice>(db.from(tbl(schema.invoices)).select("id,number,status,total,amountPaid:amount_paid,dueDate:due_date").is("cancelled_at", null).order("issue_date", { ascending: false }).limit(20)),
    ]),
  );

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src="/brand/logo-wine.png" alt={siteSettings.name} width={52} height={48} className="rounded-md bg-white p-1" />
          <div>
            <h1 className="font-serif text-2xl font-medium">Namaste, {user.name.split(" ")[0]}</h1>
            <p className="text-a-muted">Your quotations, events and invoices with {siteSettings.shortName}.</p>
          </div>
        </div>
        <form action={logout}>
          <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-md border border-a-border bg-a-surface px-3 hover:bg-a-hover">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </form>
      </header>

      {designs.length > 0 && (
        <Card title="Designs waiting for your approval">
          <ul className="divide-y divide-a-border">
            {designs.map((d) => (
              <li key={d.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <p className="font-medium">{d.title}</p>
                {d.description && <p className="text-a-muted">{d.description}</p>}
                <DesignResponse id={d.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Upcoming events">
        {events.length === 0 ? (
          <EmptyState compact icon={CalendarDays} title="No events yet">
            Your event appears here once the booking is confirmed.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-a-border">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-a-muted">
                    {fmtDate(e.eventDate)}
                    {e.venue && ` · ${e.venue}`}
                  </p>
                </div>
                <Badge>{titleCase(e.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Quotations">
        {quotes.length === 0 ? (
          <EmptyState compact icon={FileText} title="No quotations yet">
            We&rsquo;ll share your quotation here and by message.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-a-border">
            {quotes.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div>
                  <Link href={`/quote/${q.publicToken}`} className="font-medium underline-offset-2 hover:underline">
                    {q.title}
                  </Link>
                  <p className="text-a-muted">
                    {q.number} · {npr(q.total)}
                    {q.eventDate && ` · ${fmtDate(q.eventDate)}`}
                  </p>
                </div>
                <Badge>{titleCase(q.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Invoices">
        {invoices.length === 0 ? (
          <EmptyState compact icon={Receipt} title="No invoices yet" />
        ) : (
          <ul className="divide-y divide-a-border">
            {invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-medium">{i.number}</p>
                  <p className="text-a-muted">
                    {npr(i.total)} · paid {npr(i.amountPaid)}
                    {i.dueDate && ` · due ${fmtDate(i.dueDate)}`}
                  </p>
                </div>
                <Badge>{titleCase(i.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="flex items-center justify-center gap-2 text-center text-a-muted">
        <Palette className="size-4" aria-hidden /> Questions? Call {siteSettings.phones[0]?.label} or email{" "}
        <a href={`mailto:${siteSettings.email}`} className="underline underline-offset-2">
          {siteSettings.email}
        </a>
      </p>
    </main>
  );
}
