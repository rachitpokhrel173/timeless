import "server-only";
import { db, rpc, type DB } from "@/db";

export type NumberPrefix = "QT" | "BK" | "INV" | "RC" | "LD" | "IQ";

/**
 * Next sequential number for a prefix in the current year (QT-2026-001), from the
 * public.next_document_number() database function.
 */
export async function nextNumber(prefix: NumberPrefix, conn?: DB) {
  return rpc<string>(conn ?? db, "next_document_number", { p_prefix: prefix });
}
