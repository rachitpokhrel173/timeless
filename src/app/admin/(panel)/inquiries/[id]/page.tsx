import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, FilePlus2, Paperclip } from "lucide-react";
import { adminDb, cols, exec, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr } from "@/lib/format";
import { eventTypeName, eventTypeOptions, sourceOptions, userOptions } from "@/server/lookups";
import { signedUrl } from "@/server/storage";
import ActivityTimeline from "@/components/admin/ActivityTimeline";
import { ContactButtons } from "@/components/admin/contact-links";
import FollowUps from "@/components/admin/FollowUps";
import Notes from "@/components/admin/Notes";
import { BOOKING_STATUS, INQUIRY_STATUS, LEAD_STAGE, QUOTE_STATUS, StatusBadge, label } from "@/components/admin/status";
import { Badge, Card, DetailList, EmptyState, LinkButton, PageHeader } from "@/components/admin/ui";
import { InquiryStatusForm } from "../InquiryClient";

export const metadata: Metadata = { title: "Inquiry" };

export default async function InquiryPage({ params }: PageProps<"/admin/inquiries/[id]">) {
  const user = await requirePage("leads.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const inquiry = await maybe<Row<typeof schema.inquiries>>(adminDb.from(tbl(schema.inquiries)).select(cols(schema.inquiries)).eq("id", id));
  if (!inquiry) notFound();
  if (!inquiry.readAt) await exec(adminDb.from(tbl(schema.inquiries)).update({ read_at: new Date().toISOString() }).eq("id", id));

  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const [types, sources, users, lead, quotes, bookings, activities, pkg] = await Promise.all([
    eventTypeOptions(),
    sourceOptions(),
    userOptions(),
    inquiry.leadId ? maybe<Row<typeof schema.leads>>(adminDb.from(tbl(schema.leads)).select(cols(schema.leads)).eq("id", inquiry.leadId)).then((r) => r ?? undefined) : undefined,
    many<Row<typeof schema.quotations>>(
      adminDb
        .from(tbl(schema.quotations))
        .select(cols(schema.quotations))
        .is("deleted_at", null)
        .eq(inquiry.leadId ? "lead_id" : "inquiry_id", inquiry.leadId ?? id)
        .order("created_at", { ascending: false }),
    ),
    many<{ id: string; number: string; status: string }>(
      adminDb
        .from(tbl(schema.bookings))
        .select("id,number,status")
        .eq(inquiry.leadId ? "lead_id" : "inquiry_id", inquiry.leadId ?? id),
    ),
    inquiry.leadId
      ? many<Row<typeof schema.leadActivities> & { p: { fullName: string } | null }>(
          adminDb
            .from(tbl(schema.leadActivities))
            .select(`${cols(schema.leadActivities)},p:profiles(fullName:full_name)`)
            .eq("lead_id", inquiry.leadId)
            .order("created_at", { ascending: false })
            .limit(30),
        ).then((rows) => rows.map(({ p, ...a }) => ({ a, actor: p?.fullName ?? null })))
      : [],
    inquiry.packageId ? many<{ name: string }>(adminDb.from(tbl(schema.packages)).select("name").eq("id", inquiry.packageId)) : [],
  ]);
  // Attachments live in the private bucket; links are short-lived and only made for permitted staff
  const attachments = can("documents.view") || can("leads.view") ? await Promise.all(inquiry.attachments.map(async (path) => ({ path, url: await signedUrl("private-documents", path, 600).catch(() => null) }))) : [];
  const eventName = eventTypeName(types, inquiry.eventType);
  const firstName = inquiry.name.split(" ")[0];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/inquiries", label: "Inquiries" }}
        eyebrow={inquiry.kind === "BOOKING_REQUEST" ? `${inquiry.number} · Booking request` : inquiry.number}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {inquiry.name}
            <StatusBadge map={INQUIRY_STATUS} value={inquiry.status} />
            {inquiry.spam && <Badge tone="danger">Spam</Badge>}
          </span>
        }
        description={`${eventName}${inquiry.eventDate ? ` · ${fmtDate(inquiry.eventDate)}` : ""} · received ${fmtDateTime(inquiry.createdAt)}`}
        actions={
          <>
            <ContactButtons
              phone={inquiry.phone}
              email={inquiry.email}
              whatsappMessage={`Namaste ${firstName}! Thank you for your inquiry (${inquiry.number}) with Timeless Ties Events & Decor about your ${eventName.toLowerCase()}. When would be a good time to talk?`}
            />
            {can("quotations.create") && (
              <LinkButton href={`/admin/quotations/new?inquiry=${inquiry.id}`} variant="primary" icon={FilePlus2}>
                Create quotation
              </LinkButton>
            )}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Event">
            <DetailList
              items={[
                ["Event", eventName],
                ["Date", inquiry.eventDate ? fmtDate(inquiry.eventDate) : "Not decided"],
                ["Venue", inquiry.venue],
                ["Guests", inquiry.guestCount],
                ["Budget", inquiry.budget],
                ["Package", pkg[0]?.name],
                ["Services", inquiry.services.join(", ") || "—"],
                ["Theme / style", inquiry.theme],
              ]}
            />
            {inquiry.designs.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium tracking-wide text-a-muted uppercase">Designs picked from the catalogue</p>
                <ul className="mt-1 list-disc pl-5 text-[13px]">
                  {inquiry.designs.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {inquiry.message && (
              <div className="mt-4">
                <p className="text-xs font-medium tracking-wide text-a-muted uppercase">Requirements</p>
                <p className="mt-1 rounded-md bg-a-subtle p-3 text-[13px] whitespace-pre-wrap">{inquiry.message}</p>
              </div>
            )}
            {(inquiry.inspirationLinks.length > 0 || attachments.length > 0) && (
              <div className="mt-4">
                <p className="text-xs font-medium tracking-wide text-a-muted uppercase">Inspiration & attachments</p>
                <ul className="mt-1 space-y-1 text-[13px]">
                  {inquiry.inspirationLinks.map((link) => (
                    <li key={link}>
                      <a href={link} target="_blank" rel="noreferrer nofollow" className="break-all text-a-info underline">
                        {link}
                      </a>
                    </li>
                  ))}
                  {attachments.map((a) => (
                    <li key={a.path} className="flex items-center gap-1.5">
                      <Paperclip className="size-3.5 text-a-muted" aria-hidden />
                      {a.url ? (
                        <a href={a.url} target="_blank" rel="noreferrer" className="text-a-info underline">
                          {a.path.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "")}
                        </a>
                      ) : (
                        <span className="text-a-muted">{a.path.split("/").pop()} (unavailable)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <FollowUps owner={{ leadId: inquiry.leadId ?? undefined, inquiryId: inquiry.id }} canEdit={can("leads.update")} />

          <Card title="Activity">
            <ActivityTimeline entries={activities.map(({ a, actor }) => ({ id: a.id, type: a.type, body: a.body, at: a.createdAt, actor }))} empty="No activity yet." />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Handling">
            <InquiryStatusForm id={inquiry.id} status={inquiry.status} assignedTo={inquiry.assignedTo} users={users} disabled={!can("leads.update")} />
          </Card>
          <Card title="Customer">
            <DetailList
              columns={1}
              items={[
                ["Name", inquiry.customerId ? <Link key="c" href={`/admin/customers/${inquiry.customerId}`} className="text-a-info underline">{inquiry.name}</Link> : inquiry.name],
                ["Phone", inquiry.phone],
                ["Email", inquiry.email],
                ["Preferred contact", label(inquiry.preferredContact)],
                ["Lead", lead ? <Link key="l" href={`/admin/leads/${lead.id}`} className="inline-flex items-center gap-2 text-a-info underline">{lead.number} <StatusBadge map={LEAD_STAGE} value={lead.stage} /></Link> : "—"],
              ]}
            />
          </Card>
          <Card title="Source">
            <DetailList
              columns={1}
              items={[
                ["Channel", sources.find((s) => s.value === inquiry.sourceKey)?.label ?? inquiry.sourceKey],
                ["Campaign", inquiry.utm?.utm_campaign],
                ["UTM", inquiry.utm ? Object.entries(inquiry.utm).map(([k, v]) => `${k.replace("utm_", "")}: ${v}`).join(", ") : null],
                ["Referrer", inquiry.referrer],
                ["Landing page", inquiry.landingPage],
                ["Device", inquiry.device],
              ]}
            />
          </Card>
          <Card title="Quotations & bookings">
            {quotes.length === 0 && bookings.length === 0 ? (
              <EmptyState compact title="Not quoted yet" action={can("quotations.create") ? <LinkButton href={`/admin/quotations/new?inquiry=${inquiry.id}`} size="sm">Create quotation</LinkButton> : undefined} />
            ) : (
              <ul className="divide-y divide-a-border">
                {quotes.map((q) => (
                  <li key={q.id}>
                    <Link href={`/admin/quotations/${q.id}`} className="flex items-center justify-between gap-2 py-2 text-[13px] hover:bg-a-subtle/50">
                      <span>
                        <span className="font-medium">{q.number}</span> · {npr(q.total)}
                      </span>
                      <StatusBadge map={QUOTE_STATUS} value={q.status} />
                    </Link>
                  </li>
                ))}
                {bookings.map((b) => (
                  <li key={b.id}>
                    <Link href={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-2 py-2 text-[13px] hover:bg-a-subtle/50">
                      <span className="flex items-center gap-2">
                        <CalendarCheck className="size-4 text-a-muted" aria-hidden />
                        {b.number}
                      </span>
                      <StatusBadge map={BOOKING_STATUS} value={b.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Notes entityType="inquiry" entityId={inquiry.id} canEdit={can("leads.update")} />
        </div>
      </div>
    </>
  );
}
