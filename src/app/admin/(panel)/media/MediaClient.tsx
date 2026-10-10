"use client";

import { Pencil, Trash2 } from "lucide-react";
import { ActionForm, ConfirmButton, DialogButton, TextArea, TextField } from "@/components/admin/interactive";
import { deleteMedia, updateMedia } from "./actions";

export function MediaEditButton({ values }: { values: { id: string; url: string | null; title: string | null; alt: string; folder: string; tags: string[]; width: number | null; height: number | null } }) {
  return (
    <DialogButton label={<span className="sr-only">Edit image</span>} icon={Pencil} size="icon-sm" variant="ghost" title="Image details" dialogSize="lg">
      {(close) => (
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          {values.url && (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview
            <img src={values.url} alt="" className="w-full rounded-md border border-a-border object-cover" />
          )}
          <ActionForm action={updateMedia} extra={{ id: values.id }} success="Saved" onSuccess={close} onCancel={close}>
            <TextArea label="Alt text" name="alt" rows={2} defaultValue={values.alt} hint="Describe what's in the photo — used by Google and screen readers." />
            <TextField label="Title" name="title" defaultValue={values.title ?? ""} />
            <TextField label="Folder" name="folder" defaultValue={values.folder} />
            <TextField label="Tags" name="tags" defaultValue={values.tags.join(", ")} hint="Add focus:50% 30% to set the crop point." />
            {values.width && (
              <p className="text-xs text-a-muted">
                {values.width} × {values.height} px
              </p>
            )}
          </ActionForm>
        </div>
      )}
    </DialogButton>
  );
}

export function MediaDeleteButton({ id }: { id: string }) {
  return (
    <ConfirmButton size="icon-sm" icon={Trash2} title="Delete this image?" body="Only possible when nothing on the website uses it." confirmLabel="Delete" success="Deleted" action={() => deleteMedia({ id })}>
      <span className="sr-only">Delete image</span>
    </ConfirmButton>
  );
}
