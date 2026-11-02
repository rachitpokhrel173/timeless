"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Camera, CheckCircle2, PauseCircle, Play, RotateCcw, ThumbsUp } from "lucide-react";
import { Button, Dialog, inputClass, useRun, useToast } from "@/components/admin/interactive";
import UploadButton, { shrink } from "@/components/admin/Upload";
import { setTaskStatus } from "../tasks/actions";
import { uploadTaskProof } from "../upload-actions";

/**
 * The buttons on each piece of work: accept it, start it, put it on hold (with a reason), finish
 * it (note + photos) or reopen it. Big, thumb-friendly targets — the team uses this on site.
 */
export function WorkTaskActions({ id, title, status, large }: { id: string; title: string; status: string; large?: boolean }) {
  const { run, pending } = useRun();
  const [dialog, setDialog] = useState<"done" | "blocked" | null>(null);
  const close = () => setDialog(null);
  const size = large ? "lg" : "md";
  const wide = large ? "flex-1 justify-center sm:flex-none" : undefined;

  if (status === "COMPLETED")
    return (
      <div className="flex flex-wrap gap-2">
        <UploadButton action={uploadTaskProof} fields={{ taskId: id }} label="Add photos" accept="image/png,image/jpeg,image/webp" size={size} success="Photos added" />
        <Button size={size} variant="ghost" icon={RotateCcw} pending={pending} onClick={() => run(() => setTaskStatus({ id, status: "IN_PROGRESS" }), { success: "Reopened" })}>
          Reopen
        </Button>
      </div>
    );

  return (
    <div className="flex flex-wrap gap-2">
      {status === "TODO" && (
        <Button size={size} variant="primary" icon={ThumbsUp} pending={pending} className={wide} onClick={() => run(() => setTaskStatus({ id, status: "ACCEPTED" }), { success: "Accepted — the planner can see it's in hand" })}>
          Accept
        </Button>
      )}
      {status !== "IN_PROGRESS" && (
        <Button size={size} variant={status === "ACCEPTED" || status === "BLOCKED" ? "primary" : "secondary"} icon={Play} pending={pending} className={wide} onClick={() => run(() => setTaskStatus({ id, status: "IN_PROGRESS" }), { success: "Started — good luck!" })}>
          {status === "BLOCKED" ? "Resume" : "Start"}
        </Button>
      )}
      {status !== "TODO" && (
        <Button size={size} variant={status === "IN_PROGRESS" ? "primary" : "secondary"} icon={CheckCircle2} className={wide} onClick={() => setDialog("done")}>
          Done
        </Button>
      )}
      {status !== "BLOCKED" && (
        <Button size={size} variant="ghost" icon={PauseCircle} onClick={() => setDialog("blocked")}>
          On hold
        </Button>
      )}
      <Dialog open={dialog === "done"} onClose={close} title="Mark as completed" description={title}>
        {dialog === "done" && <DoneForm id={id} onDone={close} />}
      </Dialog>
      <Dialog open={dialog === "blocked"} onClose={close} title="Put on hold" description={title}>
        {dialog === "blocked" && <BlockedForm id={id} onDone={close} />}
      </Dialog>
    </div>
  );
}

function DoneForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [count, setCount] = useState(0);
  const toast = useToast();
  const router = useRouter();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const note = String(data.get("note") ?? "");
    const files = data.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    start(async () => {
      try {
        // Photos first, so a failed upload doesn't leave the task done without its proof
        if (files.length) {
          const form = new FormData();
          form.set("taskId", id);
          for (const f of await Promise.all(files.map(shrink))) form.append("file", f);
          const up = await uploadTaskProof(form);
          if (!up.ok) return toast("error", up.error);
        }
        const r = await setTaskStatus({ id, status: "COMPLETED", note });
        if (!r.ok) return toast("error", r.error);
        toast("success", "Done — nice work!");
        onDone();
        router.refresh();
      } catch {
        toast("error", "Couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-[13px] font-medium">
        Completion note <span className="font-normal text-a-muted">(optional)</span>
        <textarea name="note" rows={3} maxLength={2000} placeholder="Anything they should know — items short, damage, client feedback…" className={`${inputClass} mt-1 h-auto py-2`} />
      </label>
      <label className="block text-[13px] font-medium">
        Photos of the finished work <span className="font-normal text-a-muted">(optional, up to 10)</span>
        <span className="mt-1 flex items-center gap-2">
          <span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-a-border px-3 hover:bg-a-hover">
            <Camera className="size-4" aria-hidden />
            {count ? `${count} photo${count === 1 ? "" : "s"}` : "Take or choose photos"}
          </span>
          <input type="file" name="file" accept="image/png,image/jpeg,image/webp" capture="environment" multiple className="sr-only" onChange={(e) => setCount(e.target.files?.length ?? 0)} />
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" icon={CheckCircle2} pending={pending}>
          Mark done
        </Button>
      </div>
    </form>
  );
}

function BlockedForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { run, pending } = useRun();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
    run(() => setTaskStatus({ id, status: "BLOCKED", reason }), { success: "On hold — the planners have been told", onSuccess: onDone });
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-[13px] font-medium">
        Why is the work on hold? <span className="font-normal text-a-muted">(required — the planners are told straight away)</span>
        <textarea name="reason" rows={3} required minLength={3} maxLength={500} placeholder="Venue not open yet, flowers not delivered, item missing…" className={`${inputClass} mt-1 h-auto py-2`} />
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="danger" icon={PauseCircle} pending={pending}>
          Put on hold
        </Button>
      </div>
    </form>
  );
}
