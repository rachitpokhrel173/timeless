import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDb, maybe, schema, tbl } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { loadEditable } from "@/server/cms";
import { mediaOptions } from "@/server/lookups";
import { CONTENT_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, Card, Notice, PageHeader } from "@/components/admin/ui";
import { SectionEditor } from "../../WebsiteClient";
import { PublishPanel } from "../../PublishPanel";
import { revisionRows } from "../../revisions";

export const metadata: Metadata = { title: "Edit homepage section" };

export default async function SectionPage({ params }: PageProps<"/admin/website/sections/[key]">) {
  const user = await requirePage();
  if (!user.permissions.has("cms.view") && !user.permissions.has("cms.manage")) await requirePage("cms.view");
  const { key } = await params;
  if (!/^[a-z_]{1,40}$/.test(key)) notFound();
  const section = await maybe<{ key: string; label: string; status: string }>(adminDb.from(tbl(schema.homepageSections)).select("key,label,status").eq("key", key));
  if (!section) notFound();
  const manage = user.permissions.has("cms.manage");
  const [state, media] = await Promise.all([loadEditable("section", key), manage ? mediaOptions() : []]);
  const content = (state.draft?.content ?? state.published?.content ?? {}) as Parameters<typeof SectionEditor>[0]["initial"];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: "/admin/website", label: "Website CMS" }}
        eyebrow="Homepage section"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {section.label} <StatusBadge map={CONTENT_STATUS} value={section.status} />
            {state.draft && <Badge tone="warning">Unpublished changes</Badge>}
          </span>
        }
        description="Saving keeps your changes as a draft. Preview them, then publish to update the live homepage."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {!manage ? (
          <Notice tone="info">You can view website content but not edit it.</Notice>
        ) : (
          <Card description="Use a new line for a line break and *asterisks* around a word for the italic accent.">
            {/* key: remount with the latest draft after publish/discard/restore */}
            <SectionEditor key={state.draft?.updatedAt.toISOString() ?? "live"} sectionKey={section.key} initial={content} media={media} />
          </Card>
        )}
        <PublishPanel
          scope="section"
          contentKey={key}
          manage={manage}
          stale={state.stale}
          draft={state.draft ? { updatedAt: state.draft.updatedAt.toISOString(), editor: state.draft.editor } : null}
          previewHref={key === "offer" ? undefined : "/preview"}
          revisions={revisionRows(state.revisions)}
        />
      </div>
    </div>
  );
}
