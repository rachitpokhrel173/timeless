import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, CalendarCheck, FilePlus2, Trash2, UserCheck } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr } from "@/lib/format";
import { eventTypeName, sourceOptions, stageOptions } from "@/server/lookups";
import ActivityTimeline from "@/components/admin/ActivityTimeline";
import { ContactButtons } from "@/components/admin/contact-links";
import FollowUps from "@/components/admin/FollowUps";
import { ActionButton, ConfirmButton } from "@/components/admin/interactive";
import { ArchivedBadge, INQUIRY_STATUS, LEAD_STAGE, PRIORITY, QUOTE_STATUS, StatusBadge } from "@/components/admin/status";
import { Card, DetailList, EmptyState, LinkButton, PageHeader } from "@/components/admin/ui";
import { convertLeadToCustomer, deleteLead, setLeadArchived } from "../actions";
import { EditLeadButton, LogActivityButton, StageControl } from "../LeadClient";
import { leadFormOptions } from "../options";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params }: PageProps<"/admin/leads/[id]">) {
  const user = await requirePage("leads.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lead = await maybe<Row<typeof schema.leads>>(adminDb.from(tbl(schema.leads)).select(cols(schema.leads)).eq("id", id).is("deleted_at", null));
  if (!lead) notFound();

  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const [opts, stages, sources, inquiries, quotes, bookings, activities, campaign] = await Promise.all([
    leadFormOptions(),
    stageOptions(),
    sourceOptions(),
    many<Row<typeof schema.inquiries>>(adminDb.from(tbl(schema.inquiries)).select(cols(schema.inquiries)).eq("lead_id", id).order("created_at", { ascending: false })),
    many<Row<typeof schema.quotations>>(adminDb.from(tbl(schema.quotations)).select(cols(schema.quotations)).eq("lead_id", id).is("deleted_at", null).order("created_at", { ascending: false })),
    many<{ id: string; number: string; status: string }>(adminDb.from(tbl(schema.bookings)).select("id,number,status").eq("lead_id", id)),
    many<Row<typeof schema.leadActivities> & { p: { fullName: string } | null }>(
      adminDb
        .from(tbl(schema.leadActivities))
        .select(`${cols(schema.leadActivities)},p:profiles(fullName:full_name)`)
        .eq("lead_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ).then((rows) => rows.map(({ p, ...a }) => ({ a, actor: p?.fullName ?? null }))),
    lead.campaignId ? many<{ name: string }>(adminDb.from(tbl(schema.campaigns)).select("name").eq("id", lead.campaignId)) : [],
  ]);
  const eventName = eventTypeName(opts.eventTypes, lead.eventType);
  const firstName = lead.name.split(" ")[0];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/leads", label: "Leads" }}
        eyebrow={lead.number}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {lead.name}
            <StatusBadge map={LEAD_STAGE} value={lead.stage} />
            {lead.archivedAt && <ArchivedBadge />}
          </span>
        }
        description={[eventName, lead.eventDate && fmtDate(lead.eventDate), lead.location].filter(Boolean).join(" · ")}
        actions={
          <>
            <ContactButtons
              phone={lead.phone}
              email={lead.email}
              whatsappMessage={`Namaste ${firstName}! Thank you for contacting Timeless Ties Events & Decor about your ${eventName.toLowerCase()}${lead.eventDate ? ` on ${fmtDate(lead.eventDate)}` : ""}. When would be a good time to talk through your ideas?`}
            />
            {can("leads.update") && <EditLeadButton values={{ ...lead }} opts={opts} />}
            {can("quotations.create") && (
              <LinkButton href={`/admin/quotations/new?lead=${lead.id}`} variant="primary" icon={FilePlus2}>
                Create quotation
              </LinkButton>
            )}
          </>
        }
      />

      <div className="mb-5 rounded-xl border border-a-border bg-a-surface p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-a-muted uppercase">Pipeline stage</p>
        <StageControl id={lead.id} stage={lead.stage} stages={stages} disabled={!can("leads.update")} />
        {lead.stage === "LOST" && lead.lostReason && <p className="mt-2 text-[13px] text-a-muted">Lost because: {lead.lostReason}</p>}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Details">
            <DetailList
              items={[
                ["Phone", lead.phone],
                ["Email", lead.email],
                ["Event", eventName],
                ["Event date", lead.eventDate ? fmtDate(lead.eventDate) : "To be confirmed"],
                ["Location", lead.location],
                ["Guests", lead.guestCount],
                ["Budget", lead.budget],
                ["Source", (sources.find((s) => s.value === lead.sourceKey)?.label ?? lead.sourceKey) + (campaign[0] ? ` · ${campaign[0].name}` : "")],
                ["Priority", <StatusBadge key="p" map={PRIORITY} value={lead.priority} />],
                ["Assigned to", opts.users.find((u) => u.value === lead.assignedTo)?.label ?? "Unassigned"],
                ["Created", fmtDateTime(lead.createdAt)],
                ["Last contact", lead.lastContactAt ? fmtDateTime(lead.lastContactAt) : "Not yet"],
              ]}
            />
          </Card>

          <FollowUps owner={{ leadId: lead.id }} canEdit={can("leads.update")} />

          <Card title="Activity" actions={can("leads.update") && <LogActivityButton leadId={lead.id} />}>
            <ActivityTimeline entries={activities.map(({ a, actor }) => ({ id: a.id, type: a.type, body: a.body, at: a.createdAt, actor }))} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Customer">
            {lead.customerId ? (
              <LinkButton href={`/admin/customers/${lead.customerId}`} icon={UserCheck} className="w-full">
                Open customer history
              </LinkButton>
            ) : (
              <div className="space-y-3 text-[13px] text-a-muted">
                <p>Not linked to a customer yet. One is created automatically when you quote — or convert now.</p>
                {can("customers.create") && (
                  <ActionButton action={convertLeadToCustomer.bind(null, { id: lead.id })} success="Converted to customer" icon={<UserCheck />} className="w-full">
                    Convert to customer
                  </ActionButton>
                )}
              </div>
            )}
          </Card>

          <Card title="Inquiries">
            {inquiries.length === 0 ? (
              <p className="text-[13px] text-a-muted">Added manually — no website inquiry.</p>
            ) : (
              <ul className="divide-y divide-a-border">
                {inquiries.map((i) => (
                  <li key={i.id}>
                    <Link href={`/admin/inquiries/${i.id}`} className="flex items-center justify-between gap-2 py-2 text-[13px] hover:underline">
                      <span>
                        {i.number} · {fmtDate(i.createdAt)}
                      </span>
                      <StatusBadge map={INQUIRY_STATUS} value={i.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Quotations & bookings">
            {quotes.length === 0 && bookings.length === 0 ? (
              <EmptyState compact title="Nothing quoted yet" action={can("quotations.create") ? <LinkButton href={`/admin/quotations/new?lead=${lead.id}`} size="sm">Create quotation</LinkButton> : undefined} />
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
                    <Link href={`/admin/bookings/${b.id}`} className="flex items-center gap-2 py-2 text-[13px] hover:bg-a-subtle/50">
                      <CalendarCheck className="size-4 text-a-muted" aria-hidden />
                      <span className="font-medium">{b.number}</span> · {b.status.toLowerCase().replace("_", " ")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {(can("leads.update") || can("leads.delete")) && (
            <Card title="Manage">
              <div className="flex flex-col gap-2">
                {can("leads.update") && (
                  <ActionButton action={setLeadArchived.bind(null, { id: lead.id, archived: !lead.archivedAt })} success={lead.archivedAt ? "Lead restored" : "Lead archived"} icon={lead.archivedAt ? <ArchiveRestore /> : <Archive />}>
                    {lead.archivedAt ? "Restore lead" : "Archive lead"}
                  </ActionButton>
                )}
                {can("leads.delete") && (
                  <ConfirmButton
                    action={deleteLead.bind(null, { id: lead.id })}
                    title={`Delete ${lead.name}?`}
                    body="The lead disappears from lists. Linked quotations and bookings are kept. Prefer archiving unless the lead was created by mistake."
                    confirmLabel="Delete lead"
                    success="Lead deleted"
                    icon={<Trash2 />}
                  >
                    Delete lead
                  </ConfirmButton>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
