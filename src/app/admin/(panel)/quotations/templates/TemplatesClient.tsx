"use client";

import { Pencil, Trash2 } from "lucide-react";
import { ActionForm, ConfirmButton, DialogButton, TextArea, TextField } from "@/components/admin/interactive";
import { deleteQuoteTemplate, renameQuoteTemplate } from "../actions";

export function RenameTemplateButton({ id, name, description }: { id: string; name: string; description: string }) {
  return (
    <DialogButton label={<span className="sr-only">Rename {name}</span>} icon={Pencil} size="icon-sm" variant="ghost" title="Edit template">
      {(close) => (
        <ActionForm action={renameQuoteTemplate} extra={{ templateId: id }} success="Template updated" onSuccess={close} onCancel={close}>
          <TextField label="Name" name="name" required defaultValue={name} autoFocus />
          <TextArea label="Description" name="description" rows={2} defaultValue={description} />
          <p className="text-xs text-a-muted">To change its lines or prices, start a quotation from it, edit, and save it as a template again with the same name.</p>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmButton
      icon={Trash2}
      size="icon-sm"
      title={`Delete “${name}”?`}
      body="Quotations already made from it aren't affected."
      confirmLabel="Delete"
      success="Template deleted"
      action={() => deleteQuoteTemplate({ templateId: id })}
    >
      <span className="sr-only">Delete {name}</span>
    </ConfirmButton>
  );
}
