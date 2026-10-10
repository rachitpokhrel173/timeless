"use server";

import { z } from "zod";
import { adminDb, exec, maybe, schema, tbl, withUser, db } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { notify } from "@/server/notifications";

const input = z.object({ id: z.string().uuid(), decision: z.enum(["APPROVED", "REVISION_REQUESTED"]), response: z.string().trim().max(2000).optional() });

/**
 * A client approves a design or asks for changes. The design is first read through the client's
 * own session (RLS proves it's theirs); only then is the answer written with the system client.
 */
export async function respondToDesign(raw: z.input<typeof input>): Promise<ActionResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check your answer." };
  const { id, decision, response } = parsed.data;
  if (decision === "REVISION_REQUESTED" && !response) return { ok: false, error: "Tell us what you'd like changed.", fieldErrors: { response: "Required." } };
  const user = await getCurrentUser();
  if (!user || user.isStaff) return { ok: false, error: "Please sign in to your client account." };
  try {
    const design = await withUser(() => maybe<{ id: string; title: string; status: string; eventId: string }>(db.from(tbl(schema.designApprovals)).select("id,title,status,eventId:event_id").eq("id", id)));
    if (!design) return { ok: false, error: "That design isn't available." };
    if (!["SENT", "VIEWED"].includes(design.status)) return { ok: false, error: "This design has already been answered." };
    await exec(
      adminDb
        .from(tbl(schema.designApprovals))
        .update({ status: decision, client_response: response || null, responded_at: new Date().toISOString() })
        .eq("id", id),
    );
    await audit(user, decision === "APPROVED" ? "approve" : "revision", "design", id, `Client ${decision === "APPROVED" ? "approved" : "asked for changes to"} “${design.title}”`);
    await notify({
      type: decision === "APPROVED" ? "design.approved" : "design.revision",
      title: `${user.name} ${decision === "APPROVED" ? "approved" : "asked for changes to"} “${design.title}”`,
      body: response,
      href: `/admin/events/${design.eventId}?tab=designs`,
      priority: decision === "APPROVED" ? "MEDIUM" : "HIGH",
      permission: "events.view",
    });
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[design response]", error);
    return { ok: false, error: "Something went wrong. Please try again or contact us." };
  }
}
