import type { Metadata } from "next";
import { MessageSquareQuote } from "lucide-react";
import { adminDb, all, cols, many, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate } from "@/lib/format";
import { listParams } from "@/lib/list";
import { customerOptions, mediaOptions } from "@/server/lookups";
import { CONTENT_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, Card, EmptyState, Notice, PageHeader, Tabs } from "@/components/admin/ui";
import { TestimonialButton, TestimonialControls, TestimonialNotesButton } from "./TestimonialClient";

export const metadata: Metadata = { title: "Testimonials" };

const REVIEW = {
  PENDING: { label: "Pending review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
} as const;

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function TestimonialsPage({ searchParams }: PageProps<"/admin/website/testimonials">) {
  const user = await requirePage();
  if (!user.permissions.has("cms.view") && !user.permissions.has("cms.manage")) await requirePage("cms.view");
  const manage = user.permissions.has("cms.manage");
  const { str } = listParams(await searchParams);
  const [rows, notes, media, customers, events] = await Promise.all([
    all<Row<typeof schema.testimonials> & { photo: { url: string | null } | null }>(() =>
      adminDb.from(tbl(schema.testimonials)).select(`${cols(schema.testimonials)},photo:media!photo_id(url)`).order("featured", { ascending: false }).order("position").order("created_at", { ascending: false }).order("id"),
    ),
    all<{ testimonialId: string; notes: string }>(() => adminDb.from(tbl(schema.testimonialNotes)).select("testimonialId:testimonial_id,notes").order("testimonial_id")),
    manage ? mediaOptions() : [],
    manage ? customerOptions() : [],
    manage ? many<{ value: string; label: string }>(adminDb.from(tbl(schema.events)).select("value:id,label:title").eq("status", "COMPLETED").order("event_date", { ascending: false }).limit(100)) : [],
  ]);
  const opts = { media, customers: customers.map(({ value, label }) => ({ value, label })), events };
  const noteOf = new Map(notes.map((n) => [n.testimonialId, n.notes]));
  const samples = rows.filter((r) => r.placeholder);

  const inTab = (t: (typeof rows)[number], tab: Tab) =>
    tab === "all" ? true : tab === "archived" ? t.status === "ARCHIVED" : t.status !== "ARCHIVED" && t.reviewStatus === tab.toUpperCase();
  const pending = rows.filter((r) => inTab(r, "pending")).length;
  const requested = str("review") as Tab | undefined;
  const tab: Tab = TABS.some((t) => t.key === requested) ? requested! : pending ? "pending" : "approved";
  const shown = rows.filter((r) => inTab(r, tab));

  return (
    <>
      <PageHeader
        title="Testimonials"
        description="Client reviews for the homepage. New ones wait for review; only approved testimonials with the client's consent can be published."
        actions={manage && <TestimonialButton {...opts} />}
      />
      {samples.length > 0 && (
        <div className="mb-4">
          <Notice tone="warning" title={`${samples.length} sample testimonial${samples.length === 1 ? "" : "s"}`}>
            Sample words are never shown on the live site. Replace them with real reviews from your clients.
          </Notice>
        </div>
      )}
      <div className="mb-4">
        <Tabs
          label="Review status"
          active={tab}
          items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/admin/website/testimonials?review=${t.key}`, count: t.key === "all" ? undefined : rows.filter((r) => inTab(r, t.key)).length }))}
        />
      </div>
      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={MessageSquareQuote} title={rows.length ? "Nothing here" : "No testimonials yet"}>
            {rows.length ? "No testimonials with this status." : "Ask happy clients after their event and add their words here."}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((t) => {
            const note = noteOf.get(t.id) ?? "";
            const review = REVIEW[t.reviewStatus];
            return (
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
                      <Badge tone={review.tone}>{review.label}</Badge>
                      {t.featured && <Badge tone="gold">Featured</Badge>}
                      {t.placeholder && <Badge tone="warning">Sample</Badge>}
                      {!t.consent && !t.placeholder && <Badge tone="danger">No consent</Badge>}
                    </div>
                    <p className="text-xs text-a-muted">
                      {t.eventType}
                      {t.date ? ` · ${fmtDate(t.date)}` : ""}
                      {t.rating ? <span className="ml-1 text-a-gold">{"★".repeat(t.rating)}</span> : null}
                      {t.reviewedAt ? ` · reviewed ${fmtDate(t.reviewedAt)}` : ""}
                    </p>
                  </div>
                  {manage && (
                    <span className="flex">
                      <TestimonialNotesButton id={t.id} notes={note} />
                      <TestimonialButton {...opts} values={{ ...t, notes: note }} />
                    </span>
                  )}
                </div>
                <blockquote className="mt-3 font-serif text-lg leading-snug italic">“{t.quote}”</blockquote>
                {note && (
                  <p className="mt-3 rounded-md bg-a-subtle px-3 py-2 text-xs text-a-muted">
                    <span className="font-medium">Internal note:</span> {note}
                  </p>
                )}
                {manage && (
                  <div className="mt-3">
                    <TestimonialControls id={t.id} status={t.status} review={t.reviewStatus} consent={t.consent} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
