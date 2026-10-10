import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDb, maybe, schema, tbl } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { mediaOptions } from "@/server/lookups";
import { CONTENT_STATUS, StatusBadge } from "@/components/admin/status";
import { Card, Notice, PageHeader } from "@/components/admin/ui";
import { SectionEditor } from "../../WebsiteClient";

export const metadata: Metadata = { title: "Edit homepage section" };

export default async function SectionPage({ params }: PageProps<"/admin/website/sections/[key]">) {
  const user = await requirePage();
  if (!user.permissions.has("cms.view") && !user.permissions.has("cms.manage")) await requirePage("cms.view");
  const { key } = await params;
  if (!/^[a-z_]{1,40}$/.test(key)) notFound();
  const section = await maybe<{ key: string; label: string; status: string; content: Parameters<typeof SectionEditor>[0]["initial"] }>(
    adminDb.from(tbl(schema.homepageSections)).select("key,label,status,content").eq("key", key),
  );
  if (!section) notFound();
  const manage = user.permissions.has("cms.manage");
  const media = manage ? await mediaOptions() : [];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: "/admin/website", label: "Website CMS" }}
        eyebrow="Homepage section"
        title={
          <span className="flex items-center gap-3">
            {section.label} <StatusBadge map={CONTENT_STATUS} value={section.status} />
          </span>
        }
        description="Use a new line for a line break and *asterisks* around a word for the italic accent."
      />
      {!manage ? (
        <Notice tone="info">You can view website content but not edit it.</Notice>
      ) : (
        <Card>
          <SectionEditor sectionKey={section.key} initial={section.content} media={media} />
        </Card>
      )}
    </div>
  );
}
