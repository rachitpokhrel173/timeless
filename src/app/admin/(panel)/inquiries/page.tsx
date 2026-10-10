import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Ban, Inbox, MailOpen, Monitor, Plus, Smartphone, Tablet } from "lucide-react";
import { adminDb, cols, paged, pgrstValue, schema, tbl, total as countRows, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, relativeTime } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import { eventTypeName, eventTypeOptions, sourceOptions, userOptions } from "@/server/lookups";
import { BulkTable, FilterSelect, SearchBox } from "@/components/admin/interactive";
import { INQUIRY_STATUS, StatusBadge, options } from "@/components/admin/status";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Pagination, Tabs, Toolbar } from "@/components/admin/ui";
import { archiveInquiries, bulkInquiryStatus, markInquiriesRead, markInquiriesSpam } from "./actions";

export const metadata: Metadata = { title: "Inquiries" };

const DEVICE = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const;

export default async function InquiriesPage({ searchParams }: PageProps<"/admin/inquiries">) {
  const user = await requirePage("leads.view");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 30);
  const tab = str("tab") ?? "inbox";
  const [types, sources, users] = await Promise.all([eventTypeOptions(), sourceOptions(), userOptions()]);

  let query = adminDb.from(tbl(schema.inquiries)).select(cols(schema.inquiries), { count: "exact" });
  if (tab === "unread") query = query.is("read_at", null).is("archived_at", null).eq("spam", false);
  else if (tab === "archived") query = query.not("archived_at", "is", null).eq("spam", false);
  else if (tab === "spam") query = query.eq("spam", true);
  else query = query.is("archived_at", null).eq("spam", false);
  if (q) {
    const term = pgrstValue(likeTerm(q));
    query = query.or(["name", "phone", "email", "number", "message"].map((c) => `${c}.ilike.${term}`).join(","));
  }
  if (str("status")) query = query.eq("status", str("status")!);
  if (str("source")) query = query.eq("source_key", str("source")!);
  if (str("kind")) query = query.eq("kind", str("kind")!);
  if (str("assigned") === "me") query = query.eq("assigned_to", user.id);
  else if (str("assigned") === "none") query = query.is("assigned_to", null);
  const [{ rows, total }, unread] = await Promise.all([
    paged<Row<typeof schema.inquiries>>(query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1)),
    countRows(adminDb.from(tbl(schema.inquiries)).select("id", { count: "exact", head: true }).is("read_at", null).is("archived_at", null).eq("spam", false)),
  ]);
  const canUpdate = user.permissions.has("leads.update");
  const userName = (id: string | null) => users.find((u) => u.value === id)?.label;

  return (
    <>
      <PageHeader
        title="Inquiries"
        description="Website inquiries and booking requests, plus ones recorded by the team. Each creates a lead and links the customer."
        actions={
          user.permissions.has("leads.create") && (
            <LinkButton href="/admin/inquiries/new" variant="primary" icon={Plus}>
              Record inquiry
            </LinkButton>
          )
        }
      />
      <Tabs
        active={tab}
        items={[
          { key: "inbox", label: "Inbox", href: "/admin/inquiries" },
          { key: "unread", label: "Unread", href: "/admin/inquiries?tab=unread", count: unread },
          { key: "archived", label: "Archived", href: "/admin/inquiries?tab=archived" },
          { key: "spam", label: "Spam", href: "/admin/inquiries?tab=spam" },
        ]}
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Name, phone, IQ number or message" />
          <FilterSelect param="status" label="Status" options={options(schema.inquiryStatus.enumValues, INQUIRY_STATUS)} />
          <FilterSelect param="kind" label="Type" options={[{ value: "INQUIRY", label: "Inquiry" }, { value: "BOOKING_REQUEST", label: "Booking request" }]} />
          <FilterSelect param="source" label="Source" options={sources} />
          <FilterSelect param="assigned" label="Assigned" options={[{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }]} />
        </Toolbar>
        <BulkTable
          columns={[{ label: "Inquiry" }, { label: "Customer" }, { label: "Event" }, { label: "Source" }, { label: "Budget" }, { label: "Status" }, { label: "Assigned" }, { label: "Received" }]}
          minWidth={980}
          actions={[
            { label: "Mark read", icon: <MailOpen />, action: markInquiriesRead, success: "Marked as read" },
            ...(canUpdate
              ? [
                  { label: "Mark contacted", action: bulkInquiryStatus.bind(null, "CONTACTED"), success: "Updated" },
                  { label: "Archive", icon: <Archive />, action: archiveInquiries, success: "Archived" },
                  { label: "Spam", icon: <Ban />, action: markInquiriesSpam, confirm: "Spam is hidden and its lead is archived as lost. Continue?", success: "Marked as spam", variant: "danger" as const },
                ]
              : []),
          ]}
          rows={rows.map((r) => {
            const DeviceIcon = DEVICE[(r.device ?? "desktop") as keyof typeof DEVICE] ?? Monitor;
            return {
              id: r.id,
              className: r.readAt ? undefined : "bg-a-info-soft/30",
              cells: [
                <div key="n">
                  <Link href={`/admin/inquiries/${r.id}`} className="flex items-center gap-1.5 font-medium hover:underline">
                    {!r.readAt && <span className="size-2 shrink-0 rounded-full bg-a-info" aria-label="Unread" />}
                    {r.number}
                  </Link>
                  {r.kind === "BOOKING_REQUEST" && <Badge tone="gold" className="mt-1">Booking request</Badge>}
                </div>,
                <div key="c" className="min-w-0">
                  {r.customerId ? (
                    <Link href={`/admin/customers/${r.customerId}`} className="hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                  <span className="block text-xs text-a-muted">{r.phone}</span>
                </div>,
                <div key="e">
                  {eventTypeName(types, r.eventType)}
                  <span className="block text-xs text-a-muted">
                    {r.eventDate ? fmtDate(r.eventDate) : "No date"}
                    {r.guestCount && ` · ${r.guestCount}`}
                  </span>
                </div>,
                <span key="s" className="flex items-center gap-1.5 text-xs">
                  <DeviceIcon className="size-3.5 text-a-muted" aria-label={r.device ?? "device unknown"} />
                  {sources.find((s) => s.value === r.sourceKey)?.label ?? r.sourceKey}
                  {r.utm?.utm_campaign && <Badge icon={false}>{r.utm.utm_campaign}</Badge>}
                </span>,
                <span key="b" className="text-xs">
                  {r.budget ?? "—"}
                </span>,
                <StatusBadge key="st" map={INQUIRY_STATUS} value={r.status} />,
                userName(r.assignedTo) ?? <span className="text-a-muted">—</span>,
                <span key="d" className="text-xs" title={fmtDateTime(r.createdAt)}>
                  {relativeTime(r.createdAt)}
                </span>,
              ],
            };
          })}
          empty={
            <EmptyState icon={Inbox} title={tab === "unread" ? "No unread inquiries" : "No inquiries here"}>
              {tab === "inbox" && !q ? "When someone fills in the inquiry or booking form on the website, it lands here." : undefined}
            </EmptyState>
          }
        />
        <Pagination basePath="/admin/inquiries" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
