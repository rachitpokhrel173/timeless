"use client";

import { useState } from "react";
import { Download, FileUp, Upload } from "lucide-react";
import { Button, Dialog, useRun } from "@/components/admin/interactive";
import { Notice } from "@/components/admin/ui";
import { commitImport, previewImport } from "./import-actions";

type Entity = "customers" | "leads" | "inventory";
const TEMPLATES: Record<Entity, string> = {
  customers: "Name,Phone,Email,Address,Source\nExample Customer,9800000000,example@example.com,Kathmandu,Referral\n",
  leads: "Name,Phone,Email,Event type,Event date,Location,Guests,Budget,Source\nExample Lead,9800000000,,wedding,2026-12-01,Kathmandu,150 – 300,,Website\n",
  inventory: "SKU,Name,Category,Quantity,Low stock,Unit,Purchase cost,Replacement cost,Rental price,Location\nCHR-EXAMPLE,Example chair,Chairs,50,10,pcs,2500,2800,400,Store A\n",
};

type Preview = { total: number; valid: number; errors: { row: number; message: string }[]; moreErrors: number };

/** CSV import: choose file → server validates every row → confirm. Nothing is written until confirmed. */
export default function ImportButton({ entity }: { entity: Entity }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const { run, pending } = useRun();

  const reset = () => {
    setCsv(null);
    setPreview(null);
    setFileName("");
  };
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATES[entity])}`;

  return (
    <>
      <Button icon={Upload} onClick={() => setOpen(true)}>
        Import CSV
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title={`Import ${entity} from CSV`}
        description="Every row is checked before anything is saved."
        size="lg"
        footer={
          preview && (
            <>
              <Button onClick={reset}>Choose another file</Button>
              {preview.valid > 0 && (
                <Button
                  variant="primary"
                  pending={pending}
                  onClick={() =>
                    run(() => commitImport({ entity, csv: csv!, skipInvalid: preview.errors.length > 0 }), {
                      success: (d) => `Imported ${d.created}${d.skipped ? `, ${d.skipped} already existed` : ""}${d.invalid ? `, ${d.invalid} skipped` : ""}`,
                      onSuccess: () => {
                        setOpen(false);
                        reset();
                      },
                    })
                  }
                >
                  Import {preview.valid} row{preview.valid === 1 ? "" : "s"}
                  {preview.errors.length > 0 && " (skip invalid)"}
                </Button>
              )}
            </>
          )
        }
      >
        {!preview ? (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-a-strong px-4 py-8 text-center hover:bg-a-subtle">
              <FileUp className="size-6 text-a-muted" aria-hidden />
              <span className="text-[13px] font-medium">{fileName || "Choose a .csv file"}</span>
              <span className="text-xs text-a-muted">Up to 2,000 rows, UTF-8</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setFileName(file.name);
                  const text = await file.text();
                  setCsv(text);
                  run(() => previewImport({ entity, csv: text }), { refresh: false, onSuccess: (d) => setPreview(d) });
                }}
              />
            </label>
            <a href={templateHref} download={`${entity}-template.csv`} className="inline-flex items-center gap-1.5 text-[13px] text-a-accent underline-offset-2 hover:underline">
              <Download className="size-4" aria-hidden /> Download a template
            </a>
            {pending && <p className="text-[13px] text-a-muted">Checking rows…</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <Notice tone={preview.errors.length ? "warning" : "success"}>
              {preview.valid} of {preview.total} rows are ready to import.
              {preview.errors.length > 0 && ` ${preview.errors.length + preview.moreErrors} row(s) have problems and will be skipped unless you fix the file.`}
            </Notice>
            {preview.errors.length > 0 && (
              <div className="max-h-72 overflow-y-auto rounded-md border border-a-border">
                <table className="w-full text-left text-[13px]">
                  <thead className="sticky top-0 bg-a-subtle">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-xs font-semibold">
                        Row
                      </th>
                      <th scope="col" className="px-3 py-2 text-xs font-semibold">
                        Problem
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((e) => (
                      <tr key={e.row} className="border-t border-a-border">
                        <td className="px-3 py-1.5 tabular-nums">{e.row}</td>
                        <td className="px-3 py-1.5 text-a-danger">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.moreErrors > 0 && <p className="px-3 py-2 text-xs text-a-muted">…and {preview.moreErrors} more.</p>}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
