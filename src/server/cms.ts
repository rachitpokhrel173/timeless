import "server-only";
import { z } from "zod";
import { adminDb, db, exec, many, maybe, schema, tbl, type DB } from "@/db";
import { UserError } from "@/lib/actions";
import type { SessionUser } from "@/lib/auth/session";

/*
 * Draft → preview → publish for website content (Phase 5).
 *
 *   section  homepage_sections.content   (the live copy; visibility is the row's status)
 *   setting  site_settings.value          (public website settings: about, FAQs, contact…)
 *
 * Saving writes a private draft (cms_drafts, staff-only RLS) and leaves the live website alone.
 * Publishing copies the draft over the live content, records the published version in the
 * append-only cms_revisions table and removes the draft. Old versions can be restored into a
 * draft (never straight to the live site), previewed and published again.
 */

export type DraftScope = "section" | "setting";
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Public website settings editable from the Website CMS. */
export const CMS_SETTINGS = ["about", "faqs", "inquiry_options", "catalogue_meta", "business", "navigation"] as const;
export type CmsSetting = (typeof CMS_SETTINGS)[number];

export type Draft = { content: Json; updatedAt: Date; updatedBy: string | null; editor: string | null };
export type Revision = { id: string; action: string; note: string | null; createdAt: Date; actor: string | null; content: Json | null };

async function live(conn: DB, scope: DraftScope, key: string): Promise<{ content: Json; updatedAt: Date } | null> {
  if (scope === "section") {
    const row = await maybe<{ content: Json; updatedAt: Date }>(conn.from(tbl(schema.homepageSections)).select("content,updatedAt:updated_at").eq("key", key));
    return row;
  }
  const row = await maybe<{ value: Json; updatedAt: Date; isPublic: boolean }>(conn.from(tbl(schema.siteSettings)).select("value,updatedAt:updated_at,isPublic:is_public").eq("key", key));
  // Only public settings belong to the website CMS (never quotation/invoice settings)
  if (row && !row.isPublic) throw new UserError("That setting isn't website content.");
  return row ? { content: row.value, updatedAt: row.updatedAt } : null;
}

/** Live content, draft and publishing history for an editor page (call after a permission check). */
export async function loadEditable(scope: DraftScope, key: string) {
  const [published, draft, revisions] = await Promise.all([
    live(adminDb, scope, key),
    maybe<{ content: Json; updatedAt: Date; updatedBy: string | null; editor: { fullName: string | null } | null }>(
      adminDb.from(tbl(schema.cmsDrafts)).select("content,updatedAt:updated_at,updatedBy:updated_by,editor:profiles(fullName:full_name)").eq("scope", scope).eq("key", key),
    ),
    many<{ id: string; action: string; note: string | null; createdAt: Date; content: Json | null; actor: { fullName: string | null } | null }>(
      adminDb
        .from(tbl(schema.cmsRevisions))
        .select("id,action,note,createdAt:created_at,content,actor:profiles(fullName:full_name)")
        .eq("scope", scope)
        .eq("key", key)
        .order("created_at", { ascending: false })
        .limit(20),
    ),
  ]);
  return {
    published,
    draft: draft ? ({ content: draft.content, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy, editor: draft.editor?.fullName ?? null } satisfies Draft) : null,
    /** The live content changed after this draft was started (e.g. someone edited it in Settings). */
    stale: !!(draft && published && published.updatedAt > draft.updatedAt),
    revisions: revisions.map((r) => ({ id: r.id, action: r.action, note: r.note, createdAt: r.createdAt, content: r.content, actor: r.actor?.fullName ?? null }) satisfies Revision),
  };
}

/** Drafts for many keys at once (lists show "Unpublished changes"). */
export async function draftKeys(scope: DraftScope) {
  const rows = await many<{ key: string; updatedAt: Date }>(adminDb.from(tbl(schema.cmsDrafts)).select("key,updatedAt:updated_at").eq("scope", scope));
  return new Map(rows.map((r) => [r.key, r.updatedAt]));
}

/** Draft content overlaid on the live content — what the preview pages render. */
export async function previewContent(scope: DraftScope, keys?: string[]) {
  let q = adminDb.from(tbl(schema.cmsDrafts)).select("key,content").eq("scope", scope);
  if (keys) q = q.in("key", keys);
  const rows = await many<{ key: string; content: Json }>(q);
  return new Map(rows.map((r) => [r.key, r.content]));
}

export async function saveDraft(scope: DraftScope, key: string, content: Json, user: SessionUser) {
  if (!(await live(db, scope, key)) && scope === "section") throw new UserError("Section not found.");
  await exec(
    db.from(tbl(schema.cmsDrafts)).upsert({ scope, key, content, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "scope,key" }),
  );
}

export async function discardDraft(scope: DraftScope, key: string) {
  await exec(db.from(tbl(schema.cmsDrafts)).delete().eq("scope", scope).eq("key", key));
}

async function record(scope: string, key: string, action: "PUBLISH" | "UNPUBLISH" | "RESTORE" | "ARCHIVE", content: Json | null, user: SessionUser, note?: string) {
  await exec(db.from(tbl(schema.cmsRevisions)).insert({ scope, key, action, content, note: note ?? null, actor_id: user.id }));
}

/** Comma-separated media ids from MediaMultiPicker → a de-duplicated, ordered uuid list. */
export const uuidList = (max: number) =>
  z
    .string()
    .max(max * 40)
    .optional()
    .nullable()
    .transform((v) => [...new Set((v ?? "").split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, max));

/** Keep only ids of live website images (public bucket or shipped files), preserving order. */
export async function publicMediaIds(ids: string[]) {
  if (!ids.length) return [];
  const rows = await many<{ id: string }>(db.from(tbl(schema.media)).select("id").in("id", ids).in("bucket", ["public-media", "static"]).is("deleted_at", null).like("mime", "image/%"));
  const ok = new Set(rows.map((r) => r.id));
  return ids.filter((id) => ok.has(id));
}

/** Publish a status change on a collection item (service, package, album, testimonial) to the history. */
export async function recordPublication(scope: "section" | "service" | "package" | "album" | "testimonial", key: string, action: "PUBLISH" | "UNPUBLISH" | "ARCHIVE", user: SessionUser, note?: string) {
  await record(scope, key, action, null, user, note);
}

/**
 * Publish the draft: the live content becomes the draft's content. The first publish also keeps
 * the version that was live before it, so the change can always be undone.
 */
export async function publishDraft(scope: DraftScope, key: string, user: SessionUser): Promise<Json> {
  const draft = await maybe<{ content: Json }>(db.from(tbl(schema.cmsDrafts)).select("content").eq("scope", scope).eq("key", key));
  if (!draft) throw new UserError("There are no unpublished changes to publish.");
  const before = await live(db, scope, key);
  const history = await maybe<{ id: string }>(db.from(tbl(schema.cmsRevisions)).select("id").eq("scope", scope).eq("key", key).limit(1));
  if (!history && before) await record(scope, key, "PUBLISH", before.content, user, "Version that was live before drafts were introduced");

  if (scope === "section") {
    const row = await maybe<{ key: string }>(db.from(tbl(schema.homepageSections)).update({ content: draft.content, updated_by: user.id }).eq("key", key).select("key"));
    if (!row) throw new UserError("Section not found.");
  } else {
    await exec(db.from(tbl(schema.siteSettings)).upsert({ key, value: draft.content, is_public: true, updated_by: user.id }, { onConflict: "key" }));
  }
  await record(scope, key, "PUBLISH", draft.content, user);
  await discardDraft(scope, key);
  return draft.content;
}

/** Copy an earlier published version into the draft, to preview and publish again. */
export async function restoreRevision(id: string, user: SessionUser) {
  const rev = await maybe<{ scope: DraftScope; key: string; content: Json | null }>(db.from(tbl(schema.cmsRevisions)).select("scope,key,content").eq("id", id));
  if (!rev || rev.content === null || (rev.scope !== "section" && rev.scope !== "setting")) throw new UserError("That version can't be restored.");
  await saveDraft(rev.scope, rev.key, rev.content, user);
  await record(rev.scope, rev.key, "RESTORE", null, user, "Earlier version copied into the draft");
  return rev;
}
