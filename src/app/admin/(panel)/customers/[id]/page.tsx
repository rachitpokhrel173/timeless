import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, FilePlus2, FileText, KeyRound, Trash2, X } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, npr } from "@/lib/format";
import { getCatalogueMeta, getInquiryOptions } from "@/lib/content";
import { quoteImages } from "@/server/documents";
import { sourceOptions } from "@/server/lookups";
import { signedUrl } from "@/server/storage";
import ActivityTimeline, { type TimelineEntry } from "@/components/admin/ActivityTimeline";
import { ContactButtons } from "@/components/admin/contact-links";
import FollowUps from "@/components/admin/FollowUps";
import { ActionButton, ConfirmButton } from "@/components/admin/interactive";
import { ArchivedBadge, BOOKING_STATUS, EVENT_STATUS, INVOICE_STATUS, LEAD_STAGE, QUOTE_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, Card, DetailList, EmptyState, Kpi, LinkButton, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { deleteContact, deleteCustomer, inviteToPortal, revokePortal, setCustomerArchived } from "../actions";
import { ContactButton, EditCustomerButton } from "../CustomerForm";
import RequestedServices from "../RequestedServices";
import ReferenceImages from "../../quotations/ReferenceImages";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const user = await requirePage("customers.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const customer = await maybe<Row<typeof schema.customers>>(adminDb.from(tbl(schema.customers)).select(cols(schema.customers)).eq("id", id).is("deleted_at", null));
  if (!customer) notFound();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);

  const [sources, contacts, leads, inquiries, quotes, bookings, invoices, payments, documents, logs, images, inquiryOptions, catalogueMeta] = await Promise.all([
    sourceOptions(),
    many<Row<typeof schema.customerContacts>>(adminDb.from(tbl(schema.customerContacts)).select(cols(schema.customerContacts)).eq("customer_id", id)),
    many<Row<typeof schema.leads>>(adminDb.from(tbl(schema.leads)).select(cols(schema.leads)).eq("customer_id", id).is("deleted_at", null).order("created_at", { ascending: false })),
    many<Row<typeof schema.inquiries>>(adminDb.from(tbl(schema.inquiries)).select(cols(schema.inquiries)).eq("customer_id", id).order("created_at", { ascending: false })),
    can("quotations.view")
      ? many<Row<typeof schema.quotations>>(adminDb.from(tbl(schema.quotations)).select(cols(schema.quotations)).eq("customer_id", id).is("deleted_at", null).order("created_at", { ascending: false }))
      : [],
    can("bookings.view")
      ? many<Row<typeof schema.bookings> & { events: Row<typeof schema.events>[] }>(
          adminDb.from(tbl(schema.bookings)).select(`${cols(schema.bookings)},events(${cols(schema.events)})`).eq("customer_id", id),
        ).then((rows) =>
          rows
            .flatMap(({ events, ...b }): { b: Row<typeof schema.bookings>; e: Row<typeof schema.events> | null }[] => (events.length ? events.map((e) => ({ b, e })) : [{ b, e: null }]))
            // Latest event first; bookings without an event (rare) go first like Postgres' NULLS FIRST on desc
            .sort((x, y) => (y.e?.eventDate ?? "9999").localeCompare(x.e?.eventDate ?? "9999")),
        )
      : [],
    can("invoices.view")
      ? many<Row<typeof schema.invoices>>(adminDb.from(tbl(schema.invoices)).select(cols(schema.invoices)).eq("customer_id", id).order("issue_date", { ascending: false }))
      : [],
    can("payments.view") ? many<Row<typeof schema.payments>>(adminDb.from(tbl(schema.payments)).select(cols(schema.payments)).eq("customer_id", id).order("paid_at", { ascending: false })) : [],
    can("documents.view")
      ? many<Row<typeof schema.documents>>(adminDb.from(tbl(schema.documents)).select(cols(schema.documents)).eq("customer_id", id).is("deleted_at", null).order("created_at", { ascending: false }))
      : [],
    many<Row<typeof schema.activityLogs>>(
      adminDb.from(tbl(schema.activityLogs)).select(cols(schema.activityLogs)).eq("entity", "customer").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
    ),
    quoteImages(customer.referenceMediaIds),
    getInquiryOptions(),
    getCatalogueMeta(),
  ]);
  const serviceSuggestions = [...new Set([...inquiryOptions.services, ...catalogueMeta.offerings])];
  const leadIds = leads.map((l) => l.id);
  const activities = leadIds.length
    ? (
        await many<Row<typeof schema.leadActivities> & { l: { number: string }; p: { fullName: string } | null }>(
          adminDb
            .from(tbl(schema.leadActivities))
            .select(`${cols(schema.leadActivities)},l:leads!inner(number),p:profiles(fullName:full_name)`)
            .in("lead_id", leadIds)
            .order("created_at", { ascending: false })
            .limit(60),
        )
      ).map(({ l, p, ...a }) => ({ a, actor: p?.fullName ?? null, number: l.number }))
    : [];
  const docLinks = await Promise.all(documents.map(async (d) => ({ ...d, url: await signedUrl(d.bucket, d.path, 600, d.title).catch(() => null) })));

  // One communication & activity history across leads, quotes, payments and admin changes
  const timeline: TimelineEntry[] = [
    ...activities.map(({ a, actor, number }) => ({ id: a.id, type: a.type, body: a.body, at: a.createdAt, actor, context: number })),
    ...quotes.filter((q) => q.sentAt).map((q) => ({ id: `q-${q.id}`, type: "QUOTATION", body: `Quotation ${q.number} sent — ${npr(q.total)}`, at: q.sentAt! })),
    ...quotes.filter((q) => q.acceptedAt).map((q) => ({ id: `qa-${q.id}`, type: "QUOTATION", body: `Accepted ${q.number}${q.acceptedName ? ` (${q.acceptedName})` : ""}`, at: q.acceptedAt! })),
    ...payments.filter((p) => !p.voidedAt).map((p) => ({ id: `p-${p.id}`, type: "BOOKING", body: `Payment ${p.number}: ${npr(p.amount)} (${p.method.toLowerCase().replace("_", " ")})`, at: new Date(`${p.paidAt}T12:00:00+05:45`) })),
    ...logs.map((l) => ({ id: `l-${l.id}`, type: "SYSTEM", body: l.summary, at: l.createdAt, actor: l.userName })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const active = bookings.filter(({ b }) => b.status !== "CANCELLED");
  const lifetime = payments.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amount, 0);
  const outstanding = active.reduce((s, { b }) => s + Math.max(0, b.totalAmount - b.amountPaid), 0);
  const firstName = customer.name.split(" ")[0];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/customers", label: "Customers" }}
        eyebrow={`Customer since ${fmtDate(customer.createdAt)}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {customer.name}
            {active.length > 1 && <Badge tone="gold">Returning</Badge>}
            {customer.authUserId && <Badge tone="info">Portal access</Badge>}
            {customer.archivedAt && <ArchivedBadge />}
          </span>
        }
        description={[customer.phone, customer.email, customer.address].filter(Boolean).join(" · ")}
        actions={
          <>
            <ContactButtons phone={customer.phone} email={customer.email} whatsappMessage={`Namaste ${firstName}! This is Timeless Ties Events & Decor.`} />
            {can("customers.update") && <EditCustomerButton values={customer} sources={sources} />}
            {can("quotations.create") && (
              <LinkButton href={`/admin/quotations/new?customer=${customer.id}`} variant="primary" icon={FilePlus2}>
                New quotation
              </LinkButton>
            )}
          </>
        }
      />

      <section aria-label="Summary" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Events" value={active.length} hint={`${active.filter(({ e }) => e && e.eventDate >= new Date().toISOString().slice(0, 10)).length} upcoming`} />
        <Kpi label="Quotations" value={quotes.length} hint={`${quotes.filter((q) => q.status === "ACCEPTED").length} accepted`} />
        {can("payments.view") && <Kpi label="Paid to date" value={npr(lifetime)} />}
        {can("payments.view") && <Kpi label="Outstanding" value={npr(outstanding)} invert />}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Events & bookings" bodyClassName="p-0">
            {bookings.length === 0 ? (
              <EmptyState compact title="No bookings yet" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Event</Th>
                    <Th>Date</Th>
                    <Th>Booking</Th>
                    <Th className="text-right">Value</Th>
                    <Th className="text-right">Balance</Th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(({ b, e }) => (
                    <tr key={b.id}>
                      <Td>
                        {e ? (
                          <Link href={`/admin/events/${e.id}`} className="font-medium hover:underline">
                            {e.title}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {e && (
                          <span className="ml-2">
                            <StatusBadge map={EVENT_STATUS} value={e.status} />
                          </span>
                        )}
                      </Td>
                      <Td>{e ? fmtDate(e.eventDate) : "—"}</Td>
                      <Td>
                        <Link href={`/admin/bookings/${b.id}`} className="hover:underline">
                          {b.number}
                        </Link>{" "}
                        <StatusBadge map={BOOKING_STATUS} value={b.status} />
                      </Td>
                      <Td className="text-right tabular-nums">{npr(b.totalAmount)}</Td>
                      <Td className="text-right tabular-nums">{b.status === "CANCELLED" ? "—" : npr(Math.max(0, b.totalAmount - b.amountPaid))}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {can("quotations.view") && (
            <Card title="Quotations" bodyClassName="p-0">
              {quotes.length === 0 ? (
                <EmptyState compact title="No quotations yet" action={can("quotations.create") ? <LinkButton href={`/admin/quotations/new?customer=${customer.id}`} size="sm">Create quotation</LinkButton> : undefined} />
              ) : (
                <ul className="divide-y divide-a-border">
                  {quotes.map((q) => (
                    <li key={q.id}>
                      <Link href={`/admin/quotations/${q.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-a-subtle/50">
                        <span className="min-w-0">
                          <span className="font-medium">{q.number}</span> · {q.title}
                          <span className="block text-xs text-a-muted">{fmtDate(q.issueDate)}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums">{npr(q.total)}</span>
                          <StatusBadge map={QUOTE_STATUS} value={q.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <ReferenceImages customerId={customer.id} images={images} canEdit={can("customers.update")} />
          </Card>

          {(can("invoices.view") || can("payments.view")) && (
            <Card title="Invoices & payments" bodyClassName="p-0">
              {invoices.length === 0 && payments.length === 0 ? (
                <EmptyState compact title="No invoices or payments yet" />
              ) : (
                <ul className="divide-y divide-a-border">
                  {invoices.map((inv) => (
                    <li key={inv.id}>
                      <Link href={`/admin/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-a-subtle/50">
                        <span>
                          <FileText className="mr-1.5 inline size-3.5 text-a-muted" aria-hidden />
                          <span className="font-medium">{inv.number}</span> · due {fmtDate(inv.dueDate)}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">
                            {npr(inv.amountPaid)} / {npr(inv.total)}
                          </span>
                          <StatusBadge map={INVOICE_STATUS} value={inv.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                      <span className={p.voidedAt ? "text-a-muted line-through" : undefined}>
                        {p.number} · {fmtDate(p.paidAt)} · {p.method.toLowerCase().replace("_", " ")}
                      </span>
                      <span className="tabular-nums">{npr(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title="Communication & activity">
            <ActivityTimeline entries={timeline.slice(0, 60)} empty="No history yet." />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Details">
            <DetailList
              columns={1}
              items={[
                ["Phone", customer.phone],
                ["Alternate phone", customer.altPhone],
                ["Email", customer.email],
                ["Address", customer.address],
                ["Source", sources.find((s) => s.value === customer.sourceKey)?.label],
                ["Tags", customer.tags.join(", ") || "—"],
              ]}
            />
          </Card>

          <Card title="Requested services" description="Extras they've asked for — use them when building the quotation.">
            <RequestedServices customerId={customer.id} services={customer.requestedServices} suggestions={serviceSuggestions} canEdit={can("customers.update")} />
          </Card>

          <Card title="Contacts" actions={can("customers.update") && <ContactButton customerId={customer.id} />}>
            {contacts.length === 0 ? (
              <p className="text-[13px] text-a-muted">Family members, planners or company contacts.</p>
            ) : (
              <ul className="divide-y divide-a-border">
                {contacts.map((ct) => (
                  <li key={ct.id} className="flex items-start justify-between gap-2 py-2">
                    <div className="text-[13px]">
                      <p className="font-medium">
                        {ct.name} {ct.isPrimary && <Badge tone="accent">Primary</Badge>}
                      </p>
                      <p className="text-xs text-a-muted">{[ct.relation, ct.phone, ct.email].filter(Boolean).join(" · ")}</p>
                    </div>
                    {can("customers.update") && (
                      <div className="flex">
                        <ContactButton customerId={customer.id} values={ct} />
                        <ConfirmButton action={deleteContact.bind(null, { id: ct.id })} title={`Remove ${ct.name}?`} confirmLabel="Remove" size="icon-sm" icon={<X />} success="Contact removed">
                          <span className="sr-only">Remove contact</span>
                        </ConfirmButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Leads & inquiries">
            {leads.length === 0 && inquiries.length === 0 ? (
              <p className="text-[13px] text-a-muted">None.</p>
            ) : (
              <ul className="divide-y divide-a-border text-[13px]">
                {leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/admin/leads/${l.id}`} className="hover:underline">
                      {l.number} · {l.eventType ?? "event"}
                    </Link>
                    <StatusBadge map={LEAD_STAGE} value={l.stage} />
                  </li>
                ))}
                {inquiries.map((i) => (
                  <li key={i.id} className="py-2">
                    <Link href={`/admin/inquiries/${i.id}`} className="hover:underline">
                      {i.number}
                    </Link>{" "}
                    <span className="text-xs text-a-muted">{fmtDateTime(i.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <FollowUps owner={{ customerId: customer.id }} canEdit={can("leads.update")} />

          {can("documents.view") && (
            <Card title="Documents">
              {docLinks.length === 0 ? (
                <p className="text-[13px] text-a-muted">Upload contracts, briefs and references from the customer&rsquo;s events.</p>
              ) : (
                <ul className="space-y-1.5 text-[13px]">
                  {docLinks.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      {d.url ? (
                        <a href={d.url} className="truncate text-a-info underline" target="_blank" rel="noreferrer">
                          {d.title}
                        </a>
                      ) : (
                        <span className="truncate">{d.title}</span>
                      )}
                      <span className="flex shrink-0 gap-1">
                        <Badge icon={false}>{d.kind.toLowerCase().replace("_", " ")}</Badge>
                        {d.sharedWithCustomer && <Badge tone="info">Shared</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {can("customers.update") && (
            <Card title="Client portal" description="Customers see their quotations, bookings, invoices, schedule, shared documents and designs — nothing else.">
              {customer.authUserId ? (
                <ConfirmButton action={revokePortal.bind(null, { id: customer.id })} title="Remove portal access?" confirmLabel="Remove access" success="Portal access removed" icon={<X />}>
                  Remove portal access
                </ConfirmButton>
              ) : (
                <ActionButton action={inviteToPortal.bind(null, { id: customer.id })} success="Invitation sent" icon={<KeyRound />} disabled={!customer.email}>
                  {customer.email ? "Invite to client portal" : "Add an email to invite"}
                </ActionButton>
              )}
            </Card>
          )}

          {(can("customers.update") || can("customers.delete")) && (
            <Card title="Manage">
              <div className="flex flex-col gap-2">
                {can("customers.update") && (
                  <ActionButton action={setCustomerArchived.bind(null, { id: customer.id, archived: !customer.archivedAt })} success={customer.archivedAt ? "Customer restored" : "Customer archived"} icon={customer.archivedAt ? <ArchiveRestore /> : <Archive />}>
                    {customer.archivedAt ? "Restore customer" : "Archive customer"}
                  </ActionButton>
                )}
                {can("customers.delete") && (
                  <ConfirmButton action={deleteCustomer.bind(null, { id: customer.id })} title={`Delete ${customer.name}?`} body="Only possible for customers without quotations or bookings. Archive otherwise." confirmLabel="Delete" success="Customer deleted" icon={<Trash2 />}>
                    Delete customer
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
