import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { loadEditable } from "@/server/cms";
import { mediaOptions } from "@/server/lookups";
import { Badge, Card, Notice, PageHeader } from "@/components/admin/ui";
import { SettingEditor } from "../../WebsiteClient";
import { PublishPanel } from "../../PublishPanel";
import { revisionRows } from "../../revisions";

export const metadata: Metadata = { title: "Edit website content" };

const KEYS = {
  about: { label: "About page", fallback: {}, preview: "/preview/about" },
  faqs: { label: "FAQs", fallback: [{ q: "", a: "" }], preview: undefined },
  inquiry_options: { label: "Inquiry form options", fallback: { services: [], decorationOptions: [], guestCounts: [], budgets: [] }, preview: undefined },
  catalogue_meta: { label: "Catalogue intro", fallback: { offerings: [], priceNote: "" }, preview: undefined },
} as const;

export default async function ContentPage({ params }: PageProps<"/admin/website/content/[key]">) {
  const user = await requirePage();
  if (!user.permissions.has("cms.view") && !user.permissions.has("cms.manage")) await requirePage("cms.view");
  const { key } = await params;
  if (!(key in KEYS)) notFound();
  const k = key as keyof typeof KEYS;
  const manage = user.permissions.has("cms.manage");
  const [state, media] = await Promise.all([loadEditable("setting", k), manage ? mediaOptions() : []]);
  const initial = (state.draft?.content ?? state.published?.content ?? KEYS[k].fallback) as Parameters<typeof SettingEditor>[0]["initial"];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: "/admin/website?tab=content", label: "Website CMS" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {KEYS[k].label} {state.draft && <Badge tone="warning">Unpublished changes</Badge>}
          </span>
        }
        description="Saving keeps your changes as a draft until you publish them."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {!manage ? (
          <Notice tone="info">You can view website content but not edit it.</Notice>
        ) : (
          <Card>
            <SettingEditor key={state.draft?.updatedAt.toISOString() ?? "live"} settingKey={k} initial={initial} media={media} />
          </Card>
        )}
        <PublishPanel
          scope="setting"
          contentKey={k}
          manage={manage}
          stale={state.stale}
          draft={state.draft ? { updatedAt: state.draft.updatedAt.toISOString(), editor: state.draft.editor } : null}
          previewHref={KEYS[k].preview}
          revisions={revisionRows(state.revisions)}
        />
      </div>
    </div>
  );
}
