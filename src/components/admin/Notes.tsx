import { Pin, PinOff, StickyNote, Trash2 } from "lucide-react";
import { adminDb, cols, many, schema, tbl, type Row } from "@/db";
import { relativeTime, fmtDateTime } from "@/lib/format";
import { addNote, deleteNote, toggleNotePin } from "@/app/admin/(panel)/notes-actions";
import { ActionButton, ActionForm, ConfirmButton, TextArea } from "./interactive";
import { Card, EmptyState, InternalOnly } from "./ui";

type EntityType = "lead" | "inquiry" | "customer" | "quotation" | "booking" | "event" | "vendor" | "staff" | "inventory";

/** Private team notes for any record. Never rendered on client-facing pages. */
export default async function Notes({ entityType, entityId, canEdit }: { entityType: EntityType; entityId: string; canEdit: boolean }) {
  const notes = (
    await many<Row<typeof schema.internalNotes> & { p: { fullName: string } | null }>(
      adminDb
        .from(tbl(schema.internalNotes))
        .select(`${cols(schema.internalNotes)},p:profiles(fullName:full_name)`)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false }),
    )
  ).map(({ p, ...n }) => ({ n, author: p?.fullName ?? null }));

  return (
    <Card title="Notes" actions={<InternalOnly />}>
      {canEdit && (
        <ActionForm action={addNote} extra={{ entityType, entityId }} submitLabel="Add note" success="Note added" resetOnSuccess className="mb-4">
          <TextArea label="New note" name="body" rows={2} placeholder="Only your team can see this." />
        </ActionForm>
      )}
      {notes.length === 0 ? (
        <EmptyState compact icon={StickyNote} title="No notes yet" />
      ) : (
        <ul className="space-y-3">
          {notes.map(({ n, author }) => (
            <li key={n.id} className={n.pinned ? "rounded-lg border border-a-gold/30 bg-a-gold-soft/40 p-3" : "rounded-lg border border-a-border p-3"}>
              <p className="text-[13px] whitespace-pre-wrap">{n.body}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-a-muted">
                <span title={fmtDateTime(n.createdAt)}>
                  {author ?? "Former user"} · {relativeTime(n.createdAt)}
                  {n.pinned && " · pinned"}
                </span>
                {canEdit && (
                  <span className="flex gap-1">
                    <ActionButton size="icon-sm" variant="ghost" aria-label={n.pinned ? "Unpin note" : "Pin note"} action={toggleNotePin.bind(null, { id: n.id })}>
                      {n.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                    </ActionButton>
                    <ConfirmButton action={deleteNote.bind(null, { id: n.id })} title="Delete this note?" confirmLabel="Delete" success="Note deleted" size="icon-sm" icon={<Trash2 />} className="px-0">
                      <span className="sr-only">Delete note</span>
                    </ConfirmButton>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
