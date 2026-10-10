import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDb, maybe, schema, tbl } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { mediaOptions } from "@/server/lookups";
import { Card, Notice, PageHeader } from "@/components/admin/ui";
import { SettingEditor } from "../../WebsiteClient";

export const metadata: Metadata = { title: "Edit website content" };

const KEYS = {
  about: { label: "About page", fallback: {} },
  faqs: { label: "FAQs", fallback: [{ q: "", a: "" }] },
  inquiry_options: { label: "Inquiry form options", fallback: { services: [], decorationOptions: [], guestCounts: [], budgets: [] } },
  catalogue_meta: { label: "Catalogue intro", fallback: { offerings: [], priceNote: "" } },
} as const;

export default async function ContentPage({ params }: PageProps<"/admin/website/content/[key]">) {
  const user = await requirePage();
  if (!user.permissions.has("cms.view") && !user.permissions.has("cms.manage")) await requirePage("cms.view");
  const { key } = await params;
  if (!(key in KEYS)) notFound();
  const k = key as keyof typeof KEYS;
  const row = await maybe<{ value: Parameters<typeof SettingEditor>[0]["initial"] }>(adminDb.from(tbl(schema.siteSettings)).select("value").eq("key", k));
  const manage = user.permissions.has("cms.manage");
  const media = manage ? await mediaOptions() : [];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader back={{ href: "/admin/website?tab=content", label: "Website CMS" }} title={KEYS[k].label} />
      {!manage ? (
        <Notice tone="info">You can view website content but not edit it.</Notice>
      ) : (
        <Card>
          <SettingEditor settingKey={k} initial={row?.value ?? (KEYS[k].fallback as Parameters<typeof SettingEditor>[0]["initial"])} media={media} />
        </Card>
      )}
    </div>
  );
}
