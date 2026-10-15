import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { getSiteSettings } from "@/lib/content";
import { fmtDate, fmtDateLong, fmtDateTime, npr, num, todayISO } from "@/lib/format";
import { first, isUuid } from "@/lib/list";
import { quoteImages } from "@/server/documents";
import { PAYMENT_METHODS } from "@/server/finance";
import { eventTypeName, eventTypeOptions } from "@/server/lookups";
import ActivityTimeline from "@/components/admin/ActivityTimeline";
import { ArchivedBadge, label, QUOTE_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, Card, DetailList, Notice, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import QuoteActions from "../QuoteActions";
import ReferenceImages from "../ReferenceImages";

export const metadata: Metadata = { title: "Quotation" };

const ACTIVITY_LABEL: Record<string, string> = {
  SENT: "Sent to the client",
  VIEWED: "Client opened the quotation",
  DOWNLOADED: "Client downloaded the PDF",
  ACCEPTED: "Accepted",
  REJECTED: "Declined",
  CHANGES_REQUESTED: "Client asked for changes",
};

type Booking = { id: string; number: string; status: string; amountPaid: number };

export default async function QuotationPage({ params }: PageProps<"/admin/quotations/[id]">) {
  const user = await requirePage("quotations.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const quote = await maybe<
    Row<typeof schema.quotations> & {
      customer: { id: string; name: string; phone: string | null; email: string | null };
      lead: { id: string; number: string } | null;
      inquiry: { id: string; number: string } | null;
      pkg: { id: string; name: string } | null;
      coupon: { code: string } | null;
      booking: Booking | Booking[] | null;
    }
  >(
    adminDb
      .from(tbl(schema.quotations))
      .select(
        `${cols(schema.quotations)},customer:customers!inner(id,name,phone,email),lead:leads(id,number),inquiry:inquiries(id,number),pkg:packages(id,name),coupon:coupons(code),booking:bookings(id,number,status,amountPaid:amount_paid)`,
      )
      .eq("id", id)
      .is("deleted_at", null),
  );
  if (!quote) notFound();
  const [items, activity, versions, types, brand, images] = await Promise.all([
    many<Row<typeof schema.quotationItems>>(adminDb.from(tbl(schema.quotationItems)).select(cols(schema.quotationItems)).eq("quotation_id", id).order("position")),
    many<Row<typeof schema.quotationActivity>>(adminDb.from(tbl(schema.quotationActivity)).select(cols(schema.quotationActivity)).eq("quotation_id", id).order("created_at", { ascending: false })),
    many<{ id: string; version: number; reason: string | null; createdAt: Date; snapshot: { quote?: { total?: number } } }>(
      adminDb.from(tbl(schema.quotationVersions)).select("id,version,reason,createdAt:created_at,snapshot").eq("quotation_id", id).order("version", { ascending: false }),
    ),
    eventTypeOptions(),
    getSiteSettings(),
    quoteImages(quote.referenceMediaIds),
  ]);
  const booking = first(quote.booking);
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const shareMessage = [
    `Namaste ${quote.customer.name.split(" ")[0]},`,
    "",
    `Here is your quotation ${quote.number} from ${brand.shortName} for your ${quote.title}${quote.eventDate ? ` on ${fmtDateLong(quote.eventDate)}` : ""}.`,
    `Total: ${npr(quote.total)}`,
    ...(quote.validUntil ? [`Valid until: ${fmtDateLong(quote.validUntil)}`] : []),
    "",
    "View / download: {link}",
    "",
    "Feel free to reply here with any questions.",
  ].join("\n");
  const advancePaid = booking?.amountPaid ?? 0;
  const expired = !!quote.validUntil && quote.validUntil < todayISO() && ["SENT", "VIEWED"].includes(quote.status);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/quotations", label: "Quotations" }}
        eyebrow={`${quote.number}${quote.version > 1 ? ` · version ${quote.version}` : ""}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {quote.title}
            <StatusBadge map={QUOTE_STATUS} value={quote.status} />
            {quote.archivedAt && <ArchivedBadge />}
          </span>
        }
        description={
          <>
            For{" "}
            <Link href={`/admin/customers/${quote.customer.id}`} className="font-medium text-a-text hover:underline">
              {quote.customer.name}
            </Link>{" "}
            · issued {fmtDate(quote.issueDate)} · valid until {fmtDate(quote.validUntil)}
          </>
        }
        actions={
          <QuoteActions
            id={quote.id}
            status={quote.status}
            sent={!!quote.sentAt}
            token={quote.publicToken}
            archived={!!quote.archivedAt}
            bookingId={booking?.id ?? null}
            hasEventDate={!!quote.eventDate}
            customerEmail={quote.customer.email}
            customerPhone={quote.customer.phone}
            shareMessage={shareMessage}
            advance={{ required: quote.depositAmount, paid: advancePaid }}
            methods={PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }))}
            can={{ update: can("quotations.update"), create: can("quotations.create"), approve: can("quotations.approve"), remove: can("quotations.delete"), pay: can("payments.create") }}
          />
        }
      />

      <div className="space-y-4">
        {expired && (
          <Notice tone="warning" title="Past its valid-until date">
            The client can no longer accept it online. Edit the date and re-send, or mark it declined.
          </Notice>
        )}
        {quote.clientMessage && (
          <Notice tone={quote.status === "REJECTED" ? "danger" : "info"} title={quote.status === "REJECTED" ? "Reason given" : "Client message"}>
            “{quote.clientMessage}”
          </Notice>
        )}
        {quote.status === "ACCEPTED" && !booking && (
          <Notice tone="success" title="Accepted — ready to book">
            {quote.acceptedName ? `Accepted by ${quote.acceptedName}` : "Accepted"} on {fmtDateTime(quote.acceptedAt)}. Convert it to a booking to start planning.
          </Notice>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="Line items" bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Description</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Unit price</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      <span className="font-medium">{l.description}</span>
                      {l.details && <span className="block text-xs text-a-muted">{l.details}</span>}
                      {l.inventoryItemId && (
                        <Link href={`/admin/inventory/${l.inventoryItemId}`} className="text-[11px] text-a-gold hover:underline">
                          Inventory item
                        </Link>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {num(l.quantity)} {l.unit}
                    </Td>
                    <Td className="text-right tabular-nums">{npr(l.unitPrice)}</Td>
                    <Td className="text-right font-medium tabular-nums">{npr(l.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <dl className="ml-auto max-w-xs space-y-1.5 p-4 text-[13px]">
              <Line label="Subtotal" value={npr(quote.subtotal)} />
              {quote.discountAmount > 0 && <Line label={`Discount${quote.discountType === "PERCENT" ? ` (${quote.discountValue}%)` : ""}${quote.coupon ? ` · ${quote.coupon.code}` : ""}`} value={`− ${npr(quote.discountAmount)}`} />}
              {quote.taxAmount > 0 && <Line label={`Tax (${quote.taxRate}%)`} value={npr(quote.taxAmount)} />}
              <div className="border-t border-a-border pt-1.5 text-base font-semibold">
                <Line label="Total" value={npr(quote.total)} />
              </div>
              <Line label="Advance to confirm" value={npr(quote.depositAmount)} />
            </dl>
          </Card>

          <Card>
            <ReferenceImages quotationId={quote.id} images={images} canEdit={can("quotations.update")} />
          </Card>

          {(quote.notes || quote.terms) && (
            <Card title="Notes & terms">
              {quote.notes && <p className="mb-3 whitespace-pre-line">{quote.notes}</p>}
              {quote.terms && <p className="text-[13px] whitespace-pre-line text-a-muted">{quote.terms}</p>}
              {quote.termsVersion && <p className="mt-2 text-xs text-a-muted">Terms version {quote.termsVersion}</p>}
            </Card>
          )}

        </div>

        <div className="space-y-4">
          <Card title="Advance">
            <DetailList
              columns={1}
              items={[
                ["Required", npr(quote.depositAmount)],
                ["Received", booking ? <span className={advancePaid >= quote.depositAmount ? "font-medium text-a-success" : undefined}>{npr(advancePaid)}</span> : "Not yet"],
                ["Balance after advance", npr(quote.total - quote.depositAmount)],
              ]}
            />
            {!booking && <p className="mt-3 text-xs text-a-muted">When the client pays, use “Record advance” — it books the quotation automatically.</p>}
          </Card>
          <Card title="Event">
            <DetailList
              columns={1}
              items={[
                ["Type", eventTypeName(types, quote.eventType)],
                ["Date", fmtDate(quote.eventDate)],
                ["Venue", quote.venue],
                ["Guests", quote.guestCount ? num(quote.guestCount) : null],
                ["Package", quote.pkg ? <Link href={`/admin/packages/${quote.pkg.id}`} className="hover:underline">{quote.pkg.name}</Link> : null],
              ]}
            />
          </Card>
          <Card title="Linked records">
            <DetailList
              columns={1}
              items={[
                ["Customer", <Link key="c" href={`/admin/customers/${quote.customer.id}`} className="hover:underline">{quote.customer.name}</Link>],
                ["Lead", quote.lead ? <Link href={`/admin/leads/${quote.lead.id}`} className="hover:underline">{quote.lead.number}</Link> : null],
                ["Inquiry", quote.inquiry ? <Link href={`/admin/inquiries/${quote.inquiry.id}`} className="hover:underline">{quote.inquiry.number}</Link> : null],
                ["Booking", booking ? <Link href={`/admin/bookings/${booking.id}`} className="hover:underline">{booking.number}</Link> : null],
              ]}
            />
          </Card>
          <Card title="Client activity">
            <ActivityTimeline
              empty={quote.sentAt ? "The client hasn't opened it yet." : "Not sent yet."}
              entries={activity.map((a) => ({
                id: a.id,
                type: a.action === "SENT" ? "EMAIL" : a.action === "ACCEPTED" ? "BOOKING" : "QUOTATION",
                body: `${ACTIVITY_LABEL[a.action] ?? a.action}${a.name ? ` — ${a.name}` : ""}${a.message ? `: “${a.message}”` : ""}`,
                at: a.createdAt,
              }))}
            />
          </Card>
          {versions.length > 0 && (
            <Card title="Versions">
              <ul className="space-y-2 text-[13px]">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span>
                      <Badge icon={false}>v{v.version}</Badge> <span className="text-a-muted">{v.reason}</span>
                    </span>
                    <span className="text-right text-xs text-a-muted">
                      {v.snapshot?.quote?.total !== undefined && <span className="block font-medium text-a-text">{npr(v.snapshot.quote.total)}</span>}
                      {fmtDateTime(v.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
