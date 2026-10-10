import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { adminDb, all, cols, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { eventTypeName, eventTypeOptions, mediaOptions } from "@/server/lookups";
import { CONTENT_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { DeleteServiceItemButton, ServiceButton, ServiceItemButton } from "./ServiceClient";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const user = await requirePage();
  if (!user.permissions.has("cms.view") && !user.permissions.has("cms.manage")) await requirePage("cms.view");
  const manage = user.permissions.has("cms.manage");
  const [services, items, media, eventTypes] = await Promise.all([
    all<Row<typeof schema.services> & { image: { url: string | null } | null }>(() => adminDb.from(tbl(schema.services)).select(`${cols(schema.services)},image:media!image_id(url)`).order("position").order("id")),
    all<Row<typeof schema.serviceItems>>(() => adminDb.from(tbl(schema.serviceItems)).select(cols(schema.serviceItems)).order("position").order("id")),
    manage ? mediaOptions() : [],
    eventTypeOptions(),
  ]);

  return (
    <>
      <PageHeader title="Services" description="The decoration services on the Services page — weddings, engagements, birthdays, corporate and more." actions={manage && <ServiceButton media={media} eventTypes={eventTypes} />} />
      {services.length === 0 ? (
        <Card>
          <EmptyState icon={Sparkles} title="No services yet" />
        </Card>
      ) : (
        <div className="space-y-4">
          {services.map((s) => {
            const mine = items.filter((i) => i.serviceId === s.id);
            return (
              <Card key={s.id} bodyClassName="p-0">
                <div className="flex flex-col gap-4 p-4 sm:flex-row">
                  <div className="aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg bg-a-subtle sm:w-48">
                    {s.image?.url && (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                      <img src={s.image.url} alt="" className="size-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-serif text-xl font-medium">{s.name}</h2>
                      <StatusBadge map={CONTENT_STATUS} value={s.status} />
                      {s.featured && <Badge tone="gold">Featured</Badge>}
                      {manage && (
                        <span className="ml-auto">
                          <ServiceButton values={s} media={media} eventTypes={eventTypes} />
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] text-a-muted">
                      {s.summary} · {eventTypeName(eventTypes, s.eventType)}
                    </p>
                    <p className="mt-2 line-clamp-3 text-[13px]">{s.description}</p>
                  </div>
                </div>
                <div className="border-t border-a-border px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold tracking-wide text-a-muted uppercase">What's included</p>
                    {manage && <ServiceItemButton serviceId={s.id} />}
                  </div>
                  {mine.length === 0 ? (
                    <p className="text-[13px] text-a-muted">No items listed.</p>
                  ) : (
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {mine.map((i) => (
                        <li key={i.id} className="flex items-start justify-between gap-2 text-[13px]">
                          <span>
                            {i.title}
                            {i.description && <span className="block text-xs text-a-muted">{i.description}</span>}
                          </span>
                          {manage && (
                            <span className="flex shrink-0">
                              <ServiceItemButton serviceId={s.id} values={i} />
                              <DeleteServiceItemButton id={i.id} />
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
