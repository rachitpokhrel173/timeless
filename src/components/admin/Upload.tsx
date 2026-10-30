"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Upload as UploadIcon } from "lucide-react";
import type { ActionResult } from "@/lib/actions";
import { Button, useToast } from "./interactive";
import type { ButtonSize, ButtonVariant } from "./ui";

/** Downscale big photos before upload (keeps requests small; the server optimises again). */
export async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 3_000_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/**
 * File picker that posts straight to an upload server action. `fields` are sent alongside the
 * files (record ids, folder…). Optional `children` render extra inputs inside the form.
 */
export default function UploadButton({
  action,
  fields = {},
  label = "Upload",
  accept,
  multiple = true,
  variant = "secondary",
  size = "md",
  children,
  success = "Uploaded",
}: {
  action: (form: FormData) => Promise<ActionResult<unknown>>;
  fields?: Record<string, string | null | undefined>;
  label?: string;
  accept?: string;
  multiple?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
  success?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [name, setName] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  const submit = () =>
    start(async () => {
      const form = new FormData(formRef.current!);
      const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
      form.delete("file");
      for (const f of await Promise.all(files.map(shrink))) form.append("file", f);
      for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);
      let r: ActionResult<unknown>;
      try {
        r = await action(form);
      } catch {
        r = { ok: false, error: "The upload failed — the file may be too large (max 15 MB)." };
      }
      if (r.ok) {
        toast("success", success);
        formRef.current?.reset();
        setName(null);
        router.refresh();
      } else toast("error", r.error);
    });

  return (
    <form ref={formRef} onSubmit={(e) => (e.preventDefault(), submit())} className="flex flex-wrap items-end gap-2">
      {children}
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const files = e.target.files;
          setName(files?.length ? (files.length === 1 ? files[0]!.name : `${files.length} files`) : null);
          if (!children && files?.length) submit();
        }}
      />
      <Button variant={variant} size={size} icon={UploadIcon} pending={pending && !children} onClick={() => inputRef.current?.click()}>
        {children ? (name ?? "Choose file") : label}
      </Button>
      {children && (
        <Button type="submit" variant="primary" size={size} pending={pending} disabled={!name}>
          {label}
        </Button>
      )}
    </form>
  );
}
