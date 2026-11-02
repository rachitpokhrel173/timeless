"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Camera, CheckCircle2, HelpCircle, PackageX, PauseCircle, Play, RotateCcw, Send, ThumbsUp } from "lucide-react";
import { Button, Dialog, inputClass, useRun, useToast } from "@/components/admin/interactive";
import UploadButton, { shrink } from "@/components/admin/Upload";
import { addTaskComment } from "@/app/admin/(panel)/events/workspace-actions";
import { setTaskStatus } from "@/app/admin/(panel)/tasks/actions";
import { uploadTaskProof } from "@/app/admin/(panel)/upload-actions";

/*
 * What a team member can do on their own part of a task. Every button calls the shared server
 * actions, which run as the signed-in user: the database decides what's allowed (their own
 * assignment only; review tasks can only be submitted, never self-approved).
 */

type Dialogs = "finish" | "materials" | "hold" | "clarify" | null;

export default function StaffTaskActions({ id, title, status, reviewRequired }: { id: string; title: string; status: string; reviewRequired: boolean }) {
  const { run, pending } = useRun();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = () => setDialog(null);
  const wide = "h-11 flex-1 justify-center sm:flex-none";
  const finishLabel = reviewRequired ? "Submit for review" : "Mark done";

  const move = (next: "ACCEPTED" | "IN_PROGRESS", success: string) => run(() => setTaskStatus({ id, status: next }), { success });

  let buttons: ReactNode;
  if (status === "CANCELLED") buttons = <p className="text-[13px] text-a-muted">This task was cancelled by the office — nothing more to do.</p>;
  else if (status === "COMPLETED")
    buttons = (
      <>
        <UploadButton action={uploadTaskProof} fields={{ taskId: id }} label="Add photos" accept="image/png,image/jpeg,image/webp" size="lg" success="Photos added" />
        {!reviewRequired && (
          <Button size="lg" variant="ghost" icon={RotateCcw} pending={pending} onClick={() => move("IN_PROGRESS", "Reopened")}>
            Reopen
          </Button>
        )}
      </>
    );
  else if (status === "REVIEW")
    buttons = (
      <>
        <p className="w-full text-[13px] text-a-muted">Submitted for review. The event manager will approve it or ask for changes — you&rsquo;ll get a notification.</p>
        <UploadButton action={uploadTaskProof} fields={{ taskId: id }} label="Add more photos" accept="image/png,image/jpeg,image/webp" size="lg" success="Photos added" />
      </>
    );
  else
    buttons = (
      <>
        {status === "TODO" && (
          <Button size="lg" variant="primary" icon={ThumbsUp} pending={pending} className={wide} onClick={() => move("ACCEPTED", "Accepted — the office can see it's in hand")}>
            Accept
          </Button>
        )}
        {status !== "IN_PROGRESS" && (
          <Button size="lg" variant={status === "TODO" ? "secondary" : "primary"} icon={Play} pending={pending} className={wide} onClick={() => move("IN_PROGRESS", "Started — good luck!")}>
            {status === "BLOCKED" || status === "WAITING_MATERIALS" ? "Resume" : "Start"}
          </Button>
        )}
        {status !== "TODO" && (
          <Button size="lg" variant={status === "IN_PROGRESS" ? "primary" : "secondary"} icon={reviewRequired ? Send : CheckCircle2} className={wide} onClick={() => setDialog("finish")}>
            {finishLabel}
          </Button>
        )}
        {status !== "WAITING_MATERIALS" && (
          <Button size="lg" variant="ghost" icon={PackageX} onClick={() => setDialog("materials")}>
            Waiting for materials
          </Button>
        )}
        {status !== "BLOCKED" && (
          <Button size="lg" variant="ghost" icon={PauseCircle} onClick={() => setDialog("hold")}>
            On hold
          </Button>
        )}
      </>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {status !== "CANCELLED" && (
        <Button size="sm" variant="ghost" icon={HelpCircle} onClick={() => setDialog("clarify")}>
          Ask the office a question
        </Button>
      )}

      <Dialog open={dialog === "finish"} onClose={close} title={finishLabel} description={title}>
        {dialog === "finish" && <FinishForm id={id} reviewRequired={reviewRequired} onDone={close} />}
      </Dialog>
      <Dialog open={dialog === "materials"} onClose={close} title="Waiting for materials" description={title}>
        {dialog === "materials" && <ReasonForm id={id} status="WAITING_MATERIALS" required={false} label="What's missing?" placeholder="Flowers not delivered, short of fairy lights, backdrop frame still at the store…" submit="Mark as waiting" onDone={close} />}
      </Dialog>
      <Dialog open={dialog === "hold"} onClose={close} title="Put on hold" description={title}>
        {dialog === "hold" && <ReasonForm id={id} status="BLOCKED" required label="Why is the work on hold?" placeholder="Venue not open yet, waiting for the client, power not available…" submit="Put on hold" onDone={close} />}
      </Dialog>
      <Dialog open={dialog === "clarify"} onClose={close} title="Ask the office" description={title}>
        {dialog === "clarify" && <ClarifyForm id={id} onDone={close} />}
      </Dialog>
    </div>
  );
}

function FinishForm({ id, reviewRequired, onDone }: { id: string; reviewRequired: boolean; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [count, setCount] = useState(0);
  const toast = useToast();
  const router = useRouter();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const note = String(data.get("note") ?? "").trim();
    const files = data.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (reviewRequired && !files.length && !note) return toast("error", "Add a photo or a note so the manager can check the work.");
    start(async () => {
      try {
        // Photos first, so a failed upload never leaves the task submitted without its evidence
        if (files.length) {
          const form = new FormData();
          form.set("taskId", id);
          for (const f of await Promise.all(files.map(shrink))) form.append("file", f);
          const up = await uploadTaskProof(form);
          if (!up.ok) return toast("error", up.error);
        }
        const r = await setTaskStatus({ id, status: reviewRequired ? "REVIEW" : "COMPLETED", note: note || undefined });
        if (!r.ok) return toast("error", r.error);
        // A note on a submission is kept in the task's conversation, where the manager reviews it
        if (reviewRequired && note) {
          const c = await addTaskComment({ taskId: id, body: `Submitted for review: ${note}` });
          if (!c.ok) toast("error", `Submitted, but the note couldn't be saved: ${c.error}`);
        }
        toast("success", reviewRequired ? "Submitted — the manager will review it" : "Done — nice work!");
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
        Completion note {!reviewRequired && <span className="font-normal text-a-muted">(optional)</span>}
        <textarea name="note" rows={3} maxLength={1900} placeholder="What you did, anything short or damaged, anything the manager should check…" className={`${inputClass} mt-1 h-auto py-2`} />
      </label>
      <label className="block text-[13px] font-medium">
        Photos of the finished work <span className="font-normal text-a-muted">(up to 10)</span>
        <span className="mt-1 flex items-center gap-2">
          <span className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-md border border-a-border px-3 hover:bg-a-hover">
            <Camera className="size-4" aria-hidden />
            {count ? `${count} photo${count === 1 ? "" : "s"} chosen` : "Take or choose photos"}
          </span>
          <input type="file" name="file" accept="image/png,image/jpeg,image/webp" capture="environment" multiple className="sr-only" onChange={(e) => setCount(e.target.files?.length ?? 0)} />
        </span>
      </label>
      {reviewRequired && <p className="text-xs text-a-muted">This task needs the manager&rsquo;s approval. It stays &ldquo;Review required&rdquo; until they approve it or ask for changes.</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" icon={reviewRequired ? Send : CheckCircle2} pending={pending}>
          {reviewRequired ? "Submit for review" : "Mark done"}
        </Button>
      </div>
    </form>
  );
}

function ReasonForm({ id, status, required, label, placeholder, submit, onDone }: { id: string; status: "BLOCKED" | "WAITING_MATERIALS"; required: boolean; label: string; placeholder: string; submit: string; onDone: () => void }) {
  const { run, pending } = useRun();
  function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
    run(() => setTaskStatus({ id, status, reason: reason || undefined }), { success: "Updated — the office has been told", onSuccess: onDone });
  }
  return (
    <form onSubmit={send} className="space-y-4">
      <label className="block text-[13px] font-medium">
        {label} {!required && <span className="font-normal text-a-muted">(optional)</span>}
        <textarea name="reason" rows={3} required={required} minLength={required ? 3 : undefined} maxLength={500} placeholder={placeholder} className={`${inputClass} mt-1 h-auto py-2`} />
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant={status === "BLOCKED" ? "danger" : "primary"} icon={status === "BLOCKED" ? PauseCircle : PackageX} pending={pending}>
          {submit}
        </Button>
      </div>
    </form>
  );
}

function ClarifyForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { run, pending } = useRun();
  function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("question") ?? "").trim();
    if (!q) return;
    run(() => addTaskComment({ taskId: id, body: `Question: ${q}` }), { success: "Sent — the office has been notified", onSuccess: onDone });
  }
  return (
    <form onSubmit={send} className="space-y-4">
      <label className="block text-[13px] font-medium">
        Your question
        <textarea name="question" rows={3} required maxLength={1900} placeholder="Which backdrop colour? Where do the extra chairs go? Who has the venue key?" className={`${inputClass} mt-1 h-auto py-2`} />
      </label>
      <p className="text-xs text-a-muted">It&rsquo;s added to the task&rsquo;s comments, and the planners are notified.</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" icon={Send} pending={pending}>
          Send question
        </Button>
      </div>
    </form>
  );
}
