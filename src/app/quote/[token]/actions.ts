"use server";

import { after } from "next/server";
import { z } from "zod";
import { adminDb } from "@/db";
import { UserError, type ActionResult } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, clientUserAgent, hashIp } from "@/lib/request";
import { onQuoteAccepted } from "@/server/automation";
import { notify } from "@/server/notifications";
import { recordClientDecision } from "@/server/sales";

const input = z.object({
  token: z.string().min(20).max(100),
  action: z.enum(["ACCEPTED", "REJECTED", "CHANGES_REQUESTED"]),
  name: z.string().trim().max(120).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  agree: z.boolean().optional(),
});

/**
 * The client's answer from their private quote link. Validated by the capability token; runs
 * with the privileged client because the visitor isn't signed in.
 */
export async function respondToQuote(raw: z.input<typeof input>): Promise<ActionResult<{ action: string }>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check the form and try again." };
  const d = parsed.data;
  const fieldErrors: Record<string, string> = {};
  if (d.action === "ACCEPTED") {
    if (!d.name || d.name.length < 2) fieldErrors.name = "Type your full name to accept.";
    if (!d.agree) fieldErrors.agree = "Please confirm you agree to the terms.";
  }
  if (d.action !== "ACCEPTED" && !d.message) fieldErrors.message = "Tell us what you'd like changed.";
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Please check the highlighted fields.", fieldErrors };

  const ip = await clientIp();
  const ipHash = hashIp(ip);
  try {
    if (!(await rateLimit(`quote-response:${ipHash ?? "unknown"}`, 10, 3600))) return { ok: false, error: "Too many attempts — please try again later or contact us." };
    const quote = await recordClientDecision(adminDb, d.token, { action: d.action, name: d.name, message: d.message, ipHash, userAgent: await clientUserAgent() });
    if (d.action === "ACCEPTED") {
      // Booking, event, reservations, task and team notification (the "quote.accepted" automation)
      after(() => onQuoteAccepted(quote.id).catch((e) => console.error("[quote accepted]", e)));
    } else {
      await notify({
        type: d.action === "REJECTED" ? "quote.rejected" : "quote.changes",
        title: `${quote.number} ${d.action === "REJECTED" ? "declined by the client" : "— client asked for changes"}`,
        body: d.message ?? undefined,
        href: `/admin/quotations/${quote.id}`,
        priority: "HIGH",
        entityType: "quotation",
        entityId: quote.id,
        permission: "quotations.view",
      });
    }
    return { ok: true, data: { action: d.action } };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    console.error("[quote response]", error);
    return { ok: false, error: "Something went wrong. Please try again, or contact us directly." };
  }
}

