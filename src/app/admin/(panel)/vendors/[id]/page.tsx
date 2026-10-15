import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Handshake, ReceiptText, Star, Wallet } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr } from "@/lib/format";
import { isUuid, listParams } from "@/lib/list";
import { vendorPaid, vendorPaymentStatus } from "@/server/finance";
import { ContactButtons } from "@/components/admin/contact-links";
import { ArchivedBadge, PAY_STATUS, StatusBadge, VENDOR_STATUS, VENDOR_CATEGORIES } from "@/components/admin/status";
import { Badge, Card, DetailList, EmptyState, Table, Tabs, Td, Th } from "@/components/admin/ui";
import { ArchiveVendorButton, RecordVendorPayment, RemoveVendorPayment, VendorButton } from "../VendorClient";

export const metadata: Metadata = { title: "Vendor" };

export default async function VendorPage({ params, searchParams }: PageProps<"/admin/vendors/[id]">) {
  const user = await requirePage("vendors.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { str } = listParams(await searchParams);
  const vendor = await maybe<Row<typeof schema.vendors>>(adminDb.from(tbl(schema.vendors)).select(cols(schema.vendors)).eq("id", id));
  if (!vendor) notFound();
  const money = user.permissions.has("expenses.view");
  const canPay = user.permissions.has("expenses.create");
  const manage = user.permissions.has("vendors.manage");
  const tab = money && str("tab") === "payments" ? "payments" : "details";

  const [jobs, payments, supplies] = await Promise.all([
    many<Row<typeof schema.vendorAssignments> & { e: { id: string; title: string; eventDate: string } }>(
      adminDb.from(tbl(schema.vendorAssignments)).select(`${cols(schema.vendorAssignments)},e:events!inner(id,title,eventDate:event_date)`).eq("vendor_id", id).order("created_at", { ascending: false }),
    ),
    money
      ? many<{ id: string; description: string; amount: number; date: string }>(
          adminDb.from(tbl(schema.expenses)).select("id,description,amount,date").eq("vendor_id", id).is("voided_at", null).order("date", { ascending: false }).order("created_at", { ascending: false }),
        )
      : [],
    many<{ id: string; name: string }>(adminDb.from(tbl(schema.inventoryItems)).select("id,name").eq("supplier_id", id).is("archived_at", null).order("name")),
  ]);
  const paid = money ? await vendorPaid(jobs.map((j) => j.id)) : new Map<string, number>();
  const live = jobs.filter((j) => j.status !== "CANCELLED");
  const owed = live.reduce((s, j) => s + Math.max(0, j.cost - (paid.get(j.id) ?? 0)), 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const category = VENDOR_CATEGORIES.find((c) => c.value === vendor.category)?.label ?? "Other";

  const stats: { icon: typeof Wallet; label: string; value: string }[] = [
    ...(money ? [{ icon: Wallet, label: "Total paid", value: npr(totalPaid) }] : []),
    { icon: Star, label: "Rating", value: vendor.rating ? `${vendor.rating}.0 / 5` : "Not rated" },
    money ? { icon: ReceiptText, label: "Payments", value: String(payments.length) } : { icon: ReceiptText, label: "Jobs", value: String(live.length) },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/vendors" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-a-muted hover:text-a-text">
        <ArrowLeft className="size-4" aria-hidden />
        Vendors
      </Link>

      {/* Header: who they are, how to reach them, and the numbers that matter */}
      <section className="mb-5 overflow-hidden rounded-2xl border border-a-border bg-linear-to-b from-a-gold-soft/60 to-a-surface p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-a-gold-soft text-a-gold ring-1 ring-a-gold/40">
            <Handshake className="size-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-a-muted uppercase">Vendor</p>
            <h1 className="mt-0.5 font-serif text-2xl leading-tight font-medium break-words sm:text-[1.7rem]">{vendor.name}</h1>
            <p className="mt-0.5 text-[13px] text-a-muted">{vendor.contactPerson || category}</p>
          </div>
          {manage && (
            <div className="flex shrink-0 gap-1.5">
              <VendorButton values={vendor} />
              <ArchiveVendorButton id={id} archived={!!vendor.archivedAt} />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {vendor.archivedAt ? <ArchivedBadge /> : vendor.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
          <Badge tone="gold">{category}</Badge>
        </div>

        <div className="mt-4">
          <ContactButtons phone={vendor.phone} email={vendor.email} whatsappMessage={`Namaste ${vendor.contactPerson || vendor.name}, this is Timeless Ties Events & Decor.`} size="md" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0 rounded-xl border border-a-border bg-a-surface/80 p-3 sm:p-4">
              <p className="flex items-center gap-1.5 text-[12px] text-a-muted">
                <s.icon className="size-3.5 shrink-0 text-a-gold" aria-hidden />
                <span className="truncate">{s.label}</span>
              </p>
              <p className="mt-1 truncate font-serif text-lg font-medium tabular-nums sm:text-xl">{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      {money && (
        <Tabs
          label="Vendor sections"
          active={tab}
          items={[
            { key: "details", label: "Details", href: `/admin/vendors/${id}` },
            { key: "payments", label: "Payments", href: `/admin/vendors/${id}?tab=payments`, count: payments.length },
          ]}
        />
      )}

      {tab === "payments" ? (
        <div className="space-y-4">
          {canPay && (
            <Card title="Record a payment">
              <RecordVendorPayment vendorId={id} />
            </Card>
          )}

          <Card title="History" bodyClassName="p-0">
            {payments.length === 0 ? (
              <EmptyState compact icon={Wallet} title="No payments yet" />
            ) : (
              <ul className="divide-y divide-a-border">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-a-success-soft text-a-success">
                      <Wallet className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium tabular-nums">{npr(p.amount)}</span>
                      <span className="block truncate text-xs text-a-muted">{p.description}</span>
                    </span>
                    <span className="shrink-0 text-xs text-a-muted">{fmtDate(p.date)}</span>
                    {canPay && <RemoveVendorPayment id={p.id} label={`${npr(p.amount)} on ${fmtDate(p.date)}`} />}
                  </li>
                ))}
                <li className="flex items-center justify-between px-4 py-3">
                  <span className="font-medium">Total paid</span>
                  <span className="font-serif text-lg font-medium tabular-nums">{npr(totalPaid)}</span>
                </li>
              </ul>
            )}
          </Card>
          {owed > 0 && <p className="text-[13px] text-a-muted">Still owed on event bookings: {npr(owed)}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <Card title="Contact">
            <DetailList
              columns={2}
              items={[
                ["Contact person", vendor.contactPerson],
                ["Phone", vendor.phone],
                ["Email", vendor.email],
                ["Address", vendor.address],
                ["Typical cost", money ? npr(vendor.defaultCost) : null],
                ["Payment details", vendor.paymentInfo],
              ]}
            />
          </Card>

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
      )}
    </div>
  );
}
