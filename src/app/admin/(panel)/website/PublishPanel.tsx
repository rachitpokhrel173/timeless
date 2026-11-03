"use client";

import { useRouter } from "next/navigation";
import { Eye, History, RotateCcw, Send, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/admin/interactive";
import { Badge, buttonClass, Card, Notice } from "@/components/admin/ui";
import { discardContentDraft, publishContent, restoreContentVersion } from "./actions";

export type RevisionRow = { id: string; action: string; note: string | null; createdAt: string; actor: string | null; restorable: boolean };

const ACTION_LABEL: Record<string, string> = { PUBLISH: "Published", UNPUBLISH: "Hidden", RESTORE: "Restored into draft", ARCHIVE: "Archived" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Draft → preview → publish controls for one piece of website content. The live website only
 * changes when "Publish" is confirmed; drafts are private to staff.
 */
export function PublishPanel({
  scope,
  contentKey,
  draft,
  stale,
  previewHref,
  revisions,
  manage,
}: {
  scope: "section" | "setting";
  contentKey: string;
  draft: { updatedAt: string; editor: string | null } | null;
  stale: boolean;
  previewHref?: string;
  revisions: RevisionRow[];
  manage: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  return (
    <div className="space-y-4">
      <Card title="Publishing" description={draft ? "You have changes that visitors can't see yet." : "What's on the website now is the published version."}>
        <div className="space-y-3">
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            {draft ? <Badge tone="warning">Unpublished changes</Badge> : <Badge tone="success">Published</Badge>}
            {draft && (
              <span className="text-a-muted">
                Draft saved {when(draft.updatedAt)}
                {draft.editor ? ` by ${draft.editor}` : ""}
              </span>
            )}
          </p>
          {stale && (
            <Notice tone="warning" title="The live version changed after this draft was started">
              Someone changed the published content (for example in Settings). Publishing this draft replaces it — check the preview first.
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            {previewHref && (
              <a href={previewHref} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                <Eye className="size-4" aria-hidden /> Preview{draft ? " draft" : ""}
              </a>
            )}
            {manage && draft && (
              <>
                <ConfirmButton
                  size="sm"
                  variant="primary"
                  confirmVariant="primary"
                  icon={Send}
                  title="Publish these changes?"
                  body="The live website updates straight away. The current version is kept in the history, so you can restore it later."
                  confirmLabel="Publish"
                  success="Published — the website is updated"
                  action={() => publishContent({ scope, key: contentKey })}
                  onDone={refresh}
                >
                  Publish
                </ConfirmButton>
                <ConfirmButton
                  size="sm"
                  icon={Trash2}
                  title="Discard unpublished changes?"
                  body="The draft is deleted. The live website stays exactly as it is."
                  confirmLabel="Discard draft"
                  success="Draft discarded"
                  action={() => discardContentDraft({ scope, key: contentKey })}
                  onDone={refresh}
                >
                  Discard draft
                </ConfirmButton>
              </>
            )}
          </div>
        </div>
      </Card>
      <Card title="History" description="Every published version, newest first." bodyClassName="p-0">
        {revisions.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-a-muted">
            <History className="size-4" aria-hidden /> Nothing published from the CMS yet.
          </p>
        ) : (
          <ul className="divide-y divide-a-border">
            {revisions.map((r) => (
              <li key={r.id} className="flex items-start gap-2 px-4 py-2.5 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</p>
                  <p className="text-xs text-a-muted">
                    {when(r.createdAt)}
                    {r.actor ? ` · ${r.actor}` : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                {manage && r.restorable && (
                  <ConfirmButton
                    size="sm"
                    variant="ghost"
                    confirmVariant="primary"
                    icon={RotateCcw}
                    title="Restore this version?"
                    body={draft ? "It replaces your current draft. Nothing changes on the website until you publish." : "It becomes a draft. Nothing changes on the website until you publish."}
                    confirmLabel="Restore to draft"
                    success="Copied into the draft — preview it, then publish"
                    action={() => restoreContentVersion({ id: r.id })}
                    onDone={refresh}
                  >
                    Restore
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
