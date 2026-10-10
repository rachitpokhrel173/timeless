import type { Metadata } from "next";
import { MessageSquareQuote } from "lucide-react";
import { adminDb, all, cols, many, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate } from "@/lib/format";
import { customerOptions, mediaOptions } from "@/server/lookups";
import { CONTENT_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, Card, EmptyState, Notice, PageHeader } from "@/components/admin/ui";
import { TestimonialButton, TestimonialStatus } from "./TestimonialClient";

export const metadata: Metadata = { title: "Testimonials" };

export default async function TestimonialsPage() {
  const user = await requirePage();
  if (!user.permissions.has("cms.view") && !user.permissions.has("cms.manage")) await requirePage("cms.view");
  const manage = user.permissions.has("cms.manage");
  const [rows, media, customers, events] = await Promise.all([
    all<Row<typeof schema.testimonials> & { photo: { url: string | null } | null }>(() => adminDb.from(tbl(schema.testimonials)).select(`${cols(schema.testimonials)},photo:media!photo_id(url)`).order("position").order("created_at", { ascending: false })),
    manage ? mediaOptions() : [],
    manage ? customerOptions() : [],
    manage ? many<{ value: string; label: string }>(adminDb.from(tbl(schema.events)).select("value:id,label:title").eq("status", "COMPLETED").order("event_date", { ascending: false }).limit(100)) : [],
  ]);
  const opts = { media, customers: customers.map(({ value, label }) => ({ value, label })), events };
  const samples = rows.filter((r) => r.placeholder);

  return (
    <>
      <PageHeader title="Testimonials" description="Client reviews on the homepage. Only published testimonials with the client's consent appear on the website." actions={manage && <TestimonialButton {...opts} />} />
      {samples.length > 0 && (
        <div className="mb-4">
          <Notice tone="warning" title={`${samples.length} sample testimonial${samples.length === 1 ? "" : "s"}`}>
            Sample words are never shown on the live site. Replace them with real reviews from your clients.
          </Notice>
        </div>
      )}
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={MessageSquareQuote} title="No testimonials yet">
            Ask happy clients after their event and add their words here.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start gap-3">
                <div className="size-12 shrink-0 overflow-hidden rounded-full bg-a-subtle">
                  {t.photo?.url && (
                    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                    <img src={t.photo.url} alt="" className="size-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{t.customerName}</p>
                    <StatusBadge map={CONTENT_STATUS} value={t.status} />
                    {t.placeholder && <Badge tone="warning">Sample</Badge>}
                    {!t.consent && !t.placeholder && <Badge tone="danger">No consent</Badge>}
                  </div>
                  <p className="text-xs text-a-muted">
                    {t.eventType}
                    {t.date ? ` · ${fmtDate(t.date)}` : ""}
                    {t.rating ? <span className="ml-1 text-a-gold">{"★".repeat(t.rating)}</span> : null}
                  </p>
                </div>
                {manage && <TestimonialButton {...opts} values={t} />}
              </div>
              <blockquote className="mt-3 font-serif text-lg leading-snug italic">“{t.quote}”</blockquote>
              {manage && (
                <div className="mt-3 flex justify-end">
                  <TestimonialStatus id={t.id} status={t.status} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
