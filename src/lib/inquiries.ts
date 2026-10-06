import type { InquiryInput } from "@/types";

export type DeliveryResult = { ok: true } | { ok: false; reason: "not-configured" | "failed" };

/**
 * Hand a validated inquiry to the backend.
 *
 * Set INQUIRY_WEBHOOK_URL to any endpoint that accepts JSON (the future admin API, a
 * Zapier/Make hook, a Google Apps Script, etc.). Until one is configured, production
 * reports "not-configured" so the form can direct visitors to call or WhatsApp instead of
 * pretending the inquiry was received.
 */
export async function deliverInquiry(input: InquiryInput): Promise<DeliveryResult> {
  const endpoint = process.env.INQUIRY_WEBHOOK_URL;
  const payload = { ...input, status: "new", source: "website", createdAt: new Date().toISOString() };

  if (!endpoint) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[inquiry] INQUIRY_WEBHOOK_URL not set — logged only:", payload);
      return { ok: true };
    }
    return { ok: false, reason: "not-configured" };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.INQUIRY_WEBHOOK_SECRET && { Authorization: `Bearer ${process.env.INQUIRY_WEBHOOK_SECRET}` }),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("[inquiry] delivery failed", error);
    return { ok: false, reason: "failed" };
  }
}
