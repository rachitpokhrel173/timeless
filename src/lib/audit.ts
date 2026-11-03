import "server-only";
import { adminDb, exec, schema, tbl, vals } from "@/db";
import { clientIp, hashIp } from "@/lib/request";

type Actor = { id: string; name: string } | null;

/**
 * Record an important action in the activity log. Always written with the service-role client:
 * logins can't insert log rows themselves (migration 00027), so nobody can forge entries
 * through the API. Callers have already passed their own permission checks.
 */
export async function audit(actor: Actor, action: string, entity: string, entityId: string | null, summary: string, metadata?: Record<string, unknown>) {
  const ip = await clientIp().catch(() => null);
  await exec(
    adminDb.from(tbl(schema.activityLogs)).insert(
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
