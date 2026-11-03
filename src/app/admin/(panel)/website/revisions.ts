import type { Revision } from "@/server/cms";
import type { RevisionRow } from "./PublishPanel";

export const revisionRows = (revisions: Revision[]): RevisionRow[] =>
  revisions.map((r) => ({ id: r.id, action: r.action, note: r.note, createdAt: r.createdAt.toISOString(), actor: r.actor, restorable: r.action === "PUBLISH" && r.content !== null }));
