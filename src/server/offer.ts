import "server-only";
import { unstable_cache } from "next/cache";
import { adminDb, likeEscape, many, schema, tbl } from "@/db";
import { todayISO } from "@/lib/format";

export type OfferCoupon = {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  /** Uses left before the limit, or null when the coupon has no limit. */
  spotsLeft: number | null;
  spotsTotal: number | null;
};

/** Coupon codes are letters, digits, "-" and "_". */
export const normalizeCouponCode = (code: unknown) => {
  const c = typeof code === "string" ? code.trim().toUpperCase() : "";
  return /^[A-Z0-9_-]{2,40}$/.test(c) ? c : null;
};

/**
 * The website offer's coupon, if it can still be claimed (active, not expired, not used up).
 * Coupons aren't readable by the public, so this reads with the service role and returns only
 * what the website shows. Cached briefly so "spots left" stays close to live.
 */
export const offerCoupon = unstable_cache(
  async (code: string): Promise<OfferCoupon | null> => {
    const wanted = normalizeCouponCode(code);
    if (!wanted) return null;
    const rows = await many<{ code: string; type: "PERCENT" | "FIXED"; value: number; usageLimit: number | null; usedCount: number; active: boolean; expiresAt: string | null }>(
      adminDb
        .from(tbl(schema.coupons))
        .select("code,type,value,usageLimit:usage_limit,usedCount:used_count,active,expiresAt:expires_at")
        .ilike("code", likeEscape(wanted)),
    );
    const c = rows.find((r) => r.code.toUpperCase() === wanted);
    if (!c || !c.active || (c.expiresAt && c.expiresAt < todayISO())) return null;
    const spotsLeft = c.usageLimit === null ? null : Math.max(0, c.usageLimit - c.usedCount);
    if (spotsLeft === 0) return null;
    return { code: c.code, type: c.type, value: c.value, spotsLeft, spotsTotal: c.usageLimit };
  },
  ["offer-coupon"],
  { revalidate: 300 },
);
