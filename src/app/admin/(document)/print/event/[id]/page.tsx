import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { getSiteSettings } from "@/lib/content";
import { fmtDate, fmtDateLong, fmtTime, num } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { eventTypeName, eventTypeOptions } from "@/server/lookups";
import { signedUrl } from "@/server/storage";
import { label } from "@/components/admin/status";
import PrintButton from "@/components/documents/PrintButton";

export const metadata: Metadata = { title: "Event day sheet" };

/** One printable page for the team on the day: plan, people, vendors, what to load and the approved design. */
export default async function EventDaySheetPage({ params }: PageProps<"/admin/print/event/[id]">) {
  const user = await requirePage("events.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const event = await maybe<Row<typeof schema.events> & { customer: { name: string; phone: string | null } | null; booking: { number: string } | null }>(
    adminDb.from(tbl(schema.events)).select(`${cols(schema.events)},customer:customers(name,phone),booking:bookings(number)`).eq("id", id),
  );
  if (!event) notFound();
  const showVendors = user.permissions.has("vendors.view");
  const showInventory = user.permissions.has("inventory.view");

  const [brand, types, timeline, team, vendors, reservation, tasks, designs] = await Promise.all([
    getSiteSettings(),
    eventTypeOptions(),
    many<Row<typeof schema.eventTimeline> & { s: { name: string } | null }>(adminDb.from(tbl(schema.eventTimeline)).select(`${cols(schema.eventTimeline)},s:staff(name)`).eq("event_id", id).order("starts_at")),
    many<Row<typeof schema.staffAssignments> & { s: { name: string; role: string | null; phone: string | null } }>(
      adminDb.from(tbl(schema.staffAssignments)).select(`${cols(schema.staffAssignments)},s:staff!inner(name,role,phone)`).eq("event_id", id).order("created_at"),
    ),
    showVendors
      ? many<Row<typeof schema.vendorAssignments> & { v: { name: string; phone: string | null; category: string } }>(
          adminDb.from(tbl(schema.vendorAssignments)).select(`${cols(schema.vendorAssignments)},v:vendors!inner(name,phone,category)`).eq("event_id", id).neq("status", "CANCELLED").order("created_at"),
        )
      : [],
    showInventory ? maybe<{ id: string }>(adminDb.from(tbl(schema.inventoryReservations)).select("id").eq("event_id", id)) : null,
    many<Row<typeof schema.eventTasks> & { s: { name: string } | null }>(
      adminDb.from(tbl(schema.eventTasks)).select(`${cols(schema.eventTasks)},s:staff(name)`).eq("event_id", id).neq("status", "COMPLETED").order("position").order("due_at", { nullsFirst: false }),
    ),
    many<Row<typeof schema.designApprovals>>(adminDb.from(tbl(schema.designApprovals)).select(cols(schema.designApprovals)).eq("event_id", id).eq("status", "APPROVED").order("version", { ascending: false }).limit(1)),
  ]);
  const items = reservation
    ? await many<Row<typeof schema.inventoryReservationItems> & { item: { name: string; sku: string; unit: string } }>(
        adminDb.from(tbl(schema.inventoryReservationItems)).select(`${cols(schema.inventoryReservationItems)},item:inventory_items!inner(name,sku,unit)`).eq("reservation_id", reservation.id).order("created_at"),
      )
    : [];
  // Approved design photos (latest approved version)
  const design = designs[0];
  const designMedia = design?.mediaIds.length
    ? await many<{ id: string; bucket: string; path: string; filename: string; mime: string }>(adminDb.from(tbl(schema.media)).select("id,bucket,path,filename,mime").in("id", design.mediaIds))
    : [];
  const photos = (
    await Promise.all(designMedia.filter((m) => m.mime.startsWith("image/")).map(async (m) => ({ id: m.id, alt: m.filename, src: await signedUrl(m.bucket, m.path, 3600).catch(() => null) })))
  ).filter((p): p is { id: string; alt: string; src: string } => !!p.src);

  const time = [event.startTime && fmtTime(`${event.eventDate}T${event.startTime}+05:45`), event.endTime && fmtTime(`${event.eventDate}T${event.endTime}+05:45`)].filter(Boolean).join(" – ");

  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[820px] justify-end px-4 print:hidden">
        <PrintButton />
      </div>
      <article className="mx-auto w-full max-w-[820px] bg-white px-6 py-8 text-[13px] leading-relaxed text-neutral-800 sm:px-10 print:max-w-none print:p-0">
        <header className="flex flex-col gap-4 border-b border-neutral-300 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-[#a8864a] uppercase">Event day sheet · {brand.shortName}</p>
            <h1 className="mt-1 font-serif text-2xl leading-tight font-semibold text-[#5a1f2b]">{event.title}</h1>
            <p className="text-neutral-600">
              {eventTypeName(types, event.eventType)}
              {event.booking ? ` · ${event.booking.number}` : ""} · {label(event.status)}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="font-serif text-xl font-semibold">{fmtDateLong(event.eventDate)}</p>
            {time && <p className="text-neutral-600">{time}</p>}
          </div>
        </header>

        <section className="grid gap-x-8 gap-y-1 border-b border-neutral-200 py-4 sm:grid-cols-2">
          <Info k="Venue" v={[event.venue, event.venueAddress].filter(Boolean).join(", ") || "—"} />
          <Info k="Guests" v={event.guestCount ? num(event.guestCount) : "—"} />
          <Info k="Client" v={event.customer ? `${event.customer.name}${event.customer.phone ? ` · ${event.customer.phone}` : ""}` : "—"} />
          <Info k="Colour theme" v={event.colorTheme ?? "—"} />
          {event.requirements && (
            <div className="sm:col-span-2">
              <Info k="Requirements" v={<span className="whitespace-pre-line">{event.requirements}</span>} />
            </div>
          )}
        </section>

        <Section title="Run sheet" empty={timeline.length === 0 ? "No run sheet yet — add one on the event's Run sheet tab." : null}>
          <table className="w-full border-collapse">
            <tbody>
              {timeline.map((t) => (
                <tr key={t.id} className="border-b border-neutral-100 align-top break-inside-avoid">
                  <td className="w-6 py-2"><Box /></td>
                  <td className="w-20 py-2 font-semibold tabular-nums">
                    {fmtTime(t.startsAt)}
                    {fmtDate(t.startsAt) !== fmtDate(event.eventDate) && <span className="block text-[11px] font-normal text-neutral-500">{fmtDate(t.startsAt)}</span>}
                  </td>
                  <td className="py-2">
                    <span className="font-medium">{t.title}</span>
                    {t.notes && <span className="block text-xs text-neutral-500">{t.notes}</span>}
                  </td>
                  <td className="w-32 py-2 text-right text-xs text-neutral-600">{t.s?.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <div className="grid gap-x-8 sm:grid-cols-2">
          <Section title="Team" empty={team.length === 0 ? "No one assigned." : null}>
            <ul className="space-y-1.5">
              {team.map((m) => (
                <li key={m.id} className="flex justify-between gap-3 break-inside-avoid">
                  <span>
                    <span className="font-medium">{m.s.name}</span> <span className="text-neutral-500">· {m.role ?? m.s.role ?? "Team"}</span>
                  </span>
                  <span className="tabular-nums text-neutral-600">{m.s.phone}</span>
                </li>
              ))}
            </ul>
          </Section>
          {showVendors && (
            <Section title="Vendors" empty={vendors.length === 0 ? "No vendors booked." : null}>
              <ul className="space-y-1.5">
                {vendors.map((v) => (
                  <li key={v.id} className="flex justify-between gap-3 break-inside-avoid">
                    <span>
                      <span className="font-medium">{v.v.name}</span> <span className="text-neutral-500">· {v.service}</span>
                    </span>
                    <span className="tabular-nums text-neutral-600">{v.v.phone}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {showInventory && (
          <Section title="Load-out checklist" empty={items.length === 0 ? "No inventory reserved for this event." : null}>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-neutral-300 text-left text-[11px] tracking-wider text-neutral-500 uppercase">
                  <th className="py-1.5 font-semibold">Item</th>
                  <th className="py-1.5 text-right font-semibold">Qty</th>
                  <th className="w-16 py-1.5 text-center font-semibold">Loaded</th>
                  <th className="w-16 py-1.5 text-center font-semibold">Back</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100 break-inside-avoid">
                    <td className="py-1.5">
                      {r.item.name} <span className="text-xs text-neutral-400">{r.item.sku}</span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {num(r.quantity)} {r.item.unit}
                    </td>
                    <td className="py-1.5 text-center"><Box /></td>
                    <td className="py-1.5 text-center"><Box /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {tasks.length > 0 && (
          <Section title="Still to do">
            <ul className="space-y-1.5">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2 break-inside-avoid">
                  <Box />
                  <span>
                    {t.title}
                    <span className="text-xs text-neutral-500">{[t.s?.name, t.dueAt && `due ${fmtDate(t.dueAt)}`].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {design && (
          <Section title={`Approved design — ${design.title}`}>
            {design.description && <p className="mb-3 whitespace-pre-line">{design.description}</p>}
            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed links, printed as-is
                  <img key={p.id} src={p.src} alt={p.alt} className="aspect-[4/3] w-full break-inside-avoid rounded-lg border border-neutral-200 object-cover" />
                ))}
              </div>
            )}
          </Section>
        )}

        <footer className="mt-8 border-t border-neutral-200 pt-3 text-center text-xs text-neutral-500">
          Internal sheet for the {brand.shortName} team · Printed {fmtDateLong(new Date())}
        </footer>
      </article>
    </>
  );
}

function Section({ title, empty, children }: { title: string; empty?: string | null; children?: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">{title}</h2>
      {empty ? <p className="text-neutral-500">{empty}</p> : children}
    </section>
  );
}

function Info({ k, v }: { k: string; v: ReactNode }) {
  return (
    <p>
      <span className="text-neutral-500">{k}: </span>
      <span className="font-medium">{v}</span>
    </p>
  );
}

const Box = () => <span className="inline-block size-3.5 rounded-sm border border-neutral-400 align-middle" aria-hidden />;
