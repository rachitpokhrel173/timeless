import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { vendorPaid, vendorPaymentStatus } from "@/server/finance";
import { ContactButtons } from "@/components/admin/contact-links";
import Notes from "@/components/admin/Notes";
import { ArchivedBadge, PAY_STATUS, StatusBadge, VENDOR_STATUS, VENDOR_CATEGORIES } from "@/components/admin/status";
import { Badge, Card, DetailList, EmptyState, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { ArchiveVendorButton, VendorButton } from "../VendorClient";

export const metadata: Metadata = { title: "Vendor" };

export default async function VendorPage({ params }: PageProps<"/admin/vendors/[id]">) {
  const user = await requirePage("vendors.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const vendor = await maybe<Row<typeof schema.vendors>>(adminDb.from(tbl(schema.vendors)).select(cols(schema.vendors)).eq("id", id));
  if (!vendor) notFound();
  const money = user.permissions.has("expenses.view");
  const [jobs, payments, supplies] = await Promise.all([
    many<Row<typeof schema.vendorAssignments> & { e: { id: string; title: string; eventDate: string } }>(
      adminDb.from(tbl(schema.vendorAssignments)).select(`${cols(schema.vendorAssignments)},e:events!inner(id,title,eventDate:event_date)`).eq("vendor_id", id).order("created_at", { ascending: false }),
    ),
    money ? many<{ id: string; description: string; amount: number; date: string }>(adminDb.from(tbl(schema.expenses)).select("id,description,amount,date").eq("vendor_id", id).is("voided_at", null).order("date", { ascending: false }).limit(50)) : [],
    many<{ id: string; name: string }>(adminDb.from(tbl(schema.inventoryItems)).select("id,name").eq("supplier_id", id).is("archived_at", null).order("name")),
  ]);
  const paid = money ? await vendorPaid(jobs.map((j) => j.id)) : new Map<string, number>();
  const live = jobs.filter((j) => j.status !== "CANCELLED");
  const owed = live.reduce((s, j) => s + Math.max(0, j.cost - (paid.get(j.id) ?? 0)), 0);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/vendors", label: "Vendors" }}
        eyebrow={VENDOR_CATEGORIES.find((c) => c.value === vendor.category)?.label}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {vendor.name}
            {vendor.archivedAt && <ArchivedBadge />}
            {!vendor.active && <Badge>Inactive</Badge>}
            {vendor.rating && (
              <span className="text-base text-a-gold" aria-label={`${vendor.rating} of 5`}>
                {"★".repeat(vendor.rating)}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <ContactButtons phone={vendor.phone} email={vendor.email} />
            {user.permissions.has("vendors.manage") && <ArchiveVendorButton id={id} archived={!!vendor.archivedAt} />}
            {user.permissions.has("vendors.manage") && <VendorButton values={vendor} />}
          </>
        }
      />
      {money && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[
            ["Jobs", String(live.length)],
            ["Booked value", npr(live.reduce((s, j) => s + j.cost, 0))],
            ["Outstanding", npr(owed)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl border border-a-border bg-a-surface p-4">
              <p className="text-[13px] text-a-muted">{l}</p>
              <p className="mt-1 font-serif text-2xl font-medium tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="Event bookings" bodyClassName="p-0">
            {jobs.length === 0 ? (
              <EmptyState compact title="Not booked for any event yet">
                Book vendors from an event&rsquo;s Vendors tab.
              </EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Event</Th>
                    <Th>Service</Th>
                    <Th>Status</Th>
                    {money && <Th className="text-right">Cost</Th>}
                    {money && <Th>Payment</Th>}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <Td>
                        <Link href={`/admin/events/${j.e.id}?tab=vendors`} className="font-medium hover:underline">
                          {j.e.title}
                        </Link>
                        <span className="block text-xs text-a-muted">{fmtDate(j.e.eventDate)}</span>
                      </Td>
                      <Td>{j.service}</Td>
                      <Td>
                        <StatusBadge map={VENDOR_STATUS} value={j.status} />
                      </Td>
                      {money && <Td className="text-right tabular-nums">{npr(j.cost)}</Td>}
                      {money && <Td>{j.status !== "CANCELLED" && j.cost > 0 ? <StatusBadge map={PAY_STATUS} value={vendorPaymentStatus(j.cost, paid.get(j.id) ?? 0)} /> : "—"}</Td>}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          {money && payments.length > 0 && (
            <Card title="Payments made" bodyClassName="p-0">
              <ul className="divide-y divide-a-border text-[13px]">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 px-4 py-2.5">
                    <span>
                      {p.description}
                      <span className="block text-xs text-a-muted">{fmtDate(p.date)}</span>
                    </span>
                    <span className="font-medium tabular-nums">{npr(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Notes entityType="vendor" entityId={id} canEdit={user.permissions.has("vendors.manage")} />
        </div>
        <div className="space-y-4">
          <Card title="Contact">
            <DetailList
              columns={1}
              items={[
                ["Contact person", vendor.contactPerson],
                ["Phone", vendor.phone],
                ["Email", vendor.email],
                ["Address", vendor.address],
                ["Typical cost", money ? npr(vendor.defaultCost) : null],
                ["Payment details", vendor.paymentInfo],
                ["Notes", vendor.notes],
              ]}
            />
          </Card>
          {supplies.length > 0 && (
            <Card title="Supplies inventory">
              <ul className="space-y-1 text-[13px]">
                {supplies.map((s) => (
                  <li key={s.id}>
                    <Link href={`/admin/inventory/${s.id}`} className="hover:underline">
                      {s.name}
                    </Link>
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
