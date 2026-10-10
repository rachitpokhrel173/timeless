import "server-only";
import { adminDb, exec, maybe, schema, tbl, vals } from "@/db";
import { notify } from "./notifications";

/** First view of a sent quote through its private link: mark it viewed and tell the team (once). */
export async function recordQuoteView(token: string, ipHash: string | null, userAgent: string | null) {
  const quote = await maybe<{ id: string; number: string; status: string; viewedAt: string | null }>(
    adminDb.from(tbl(schema.quotations)).select("id,number,status,viewedAt:viewed_at").eq("public_token", token).not("sent_at", "is", null),
  );
  if (!quote || quote.viewedAt) return;
  await exec(
    adminDb
      .from(tbl(schema.quotations))
      .update({ viewed_at: new Date().toISOString(), ...(quote.status === "SENT" ? { status: "VIEWED" } : {}) })
      .eq("id", quote.id),
  );
  await exec(adminDb.from(tbl(schema.quotationActivity)).insert(vals(schema.quotationActivity, { quotationId: quote.id, action: "VIEWED", ipHash, userAgent })));
  await notify({
    type: "quote.viewed",
    title: `Client opened ${quote.number}`,
    href: `/admin/quotations/${quote.id}`,
    priority: "LOW",
    entityType: "quotation",
    entityId: quote.id,
    permission: "quotations.view",
    dedupeKey: `viewed:${quote.id}`,
  });
}
