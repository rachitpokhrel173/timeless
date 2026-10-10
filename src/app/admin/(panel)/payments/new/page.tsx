import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { adminDb, all, schema, tbl } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr } from "@/lib/format";
import { first } from "@/lib/list";
import { PAYMENT_METHODS } from "@/server/finance";
import { label } from "@/components/admin/status";
import { Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { PaymentButton } from "../../bookings/BookingClient";

export const metadata: Metadata = { title: "Record payment" };

type Ev = { title: string; eventDate: string };

/** Pick the booking the money is for, then record it (payments always belong to a booking). */
export default async function NewPaymentPage() {
  await requirePage("payments.create");
  const open = (
    await all<{ id: string; number: string; totalAmount: number; amountPaid: number; status: string; c: { name: string; email: string | null }; e: Ev | Ev[] | null }>(() =>
      adminDb
        .from(tbl(schema.bookings))
        .select("id,number,totalAmount:total_amount,amountPaid:amount_paid,status,c:customers!inner(name,email),e:events(title,eventDate:event_date)")
        .neq("status", "CANCELLED")
        .order("created_at", { ascending: false })
        .order("id"),
    )
  ).filter((b) => b.totalAmount > b.amountPaid);
  const methods = PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Record payment" description="Choose the booking the client is paying for." back={{ href: "/admin/payments", label: "Payments" }} />
      <Card bodyClassName="p-0">
        {open.length === 0 ? (
          <EmptyState icon={Wallet} title="Nothing outstanding">
            Every active booking is fully paid.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-a-border">
            {open.map((b) => {
              const ev = first(b.e);
              const balance = b.totalAmount - b.amountPaid;
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/bookings/${b.id}?tab=payments`} className="font-medium hover:underline">
                      {b.c.name} — {ev?.title ?? b.number}
                    </Link>
                    <p className="text-xs text-a-muted">
                      {b.number} · {fmtDate(ev?.eventDate)} · paid {npr(b.amountPaid)} of {npr(b.totalAmount)}
                    </p>
                  </div>
                  <span className="font-medium text-a-warning tabular-nums">{npr(balance)}</span>
                  <PaymentButton bookingId={b.id} balance={balance} invoices={[]} hasEmail={!!b.c.email} methods={methods} label="Record" variant="secondary" />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
