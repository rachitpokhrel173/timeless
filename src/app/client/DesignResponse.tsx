"use client";

import { useState } from "react";
import { Button, inputClass, useRun } from "@/components/admin/interactive";
import { respondToDesign } from "./actions";

export default function DesignResponse({ id }: { id: string }) {
  const [changes, setChanges] = useState(false);
  const [text, setText] = useState("");
  const { run, pending } = useRun();
  return (
    <div className="space-y-2">
      {changes && <textarea aria-label="What would you like changed?" value={text} onChange={(e) => setText(e.target.value)} rows={3} className={`${inputClass} h-auto py-2`} placeholder="What would you like changed?" />}
      <div className="flex flex-wrap gap-2">
        {!changes ? (
          <>
            <Button variant="primary" pending={pending} onClick={() => run(() => respondToDesign({ id, decision: "APPROVED" }), { success: "Thank you — design approved" })}>
              Approve design
            </Button>
            <Button onClick={() => setChanges(true)}>Request changes</Button>
          </>
        ) : (
          <>
            <Button variant="primary" pending={pending} disabled={!text.trim()} onClick={() => run(() => respondToDesign({ id, decision: "REVISION_REQUESTED", response: text }), { success: "Sent — we'll revise the design" })}>
              Send request
            </Button>
            <Button onClick={() => setChanges(false)}>Cancel</Button>
          </>
        )}
      </div>
    </div>
  );
}
