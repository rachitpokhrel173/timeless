import "server-only";
import { adminDb, db, exec, inUserContext, schema, tbl, vals } from "@/db";
import { clientIp, hashIp } from "@/lib/request";

type Actor = { id: string; name: string } | null;

/**
 * Record an important action in the activity log. Inside an admin action it is written as the
 * signed-in user; system events use the service-role client.
 */
export async function audit(actor: Actor, action: string, entity: string, entityId: string | null, summary: string, metadata?: Record<string, unknown>) {
  const ip = await clientIp().catch(() => null);
  const conn = inUserContext() && actor ? db : adminDb;
  await exec(
    conn.from(tbl(schema.activityLogs)).insert(
      vals(schema.activityLogs, {
        userId: actor?.id ?? null,
        userName: actor?.name ?? "System",
        action,
        entity,
        entityId,
        summary,
        metadata,
        ipHash: hashIp(ip),
      }),
    ),
  );
}
