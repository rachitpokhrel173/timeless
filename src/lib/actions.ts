import "server-only";
import { z } from "zod";
import { withUser } from "@/db";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** A message that is safe to show to the admin (validation/business rule). Anything else is masked. */
export class UserError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

function flattenZod(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/**
 * Wrap a server action with authentication, a permission check, input validation and error
 * masking. The handler runs as the signed-in Supabase user (their session), so Row Level
 * Security applies to every write; the permission check here is defence in depth on top.
 * Raw database errors never reach the browser — they're logged server-side.
 */
export function adminAction<S extends z.ZodType, R>(
  permission: Permission | Permission[] | null,
  schema: S,
  handler: (input: z.output<S>, user: SessionUser) => Promise<R>,
): (input: z.input<S>) => Promise<ActionResult<R>> {
  return async (input) => {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Your session has ended. Please sign in again." };
    if (!user.isStaff && permission !== null) return { ok: false, error: "You don't have permission to do that." };
    const needed = permission === null ? [] : Array.isArray(permission) ? permission : [permission];
    if (needed.length && !needed.some((p) => user.permissions.has(p))) {
      return { ok: false, error: "You don't have permission to do that." };
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors: flattenZod(parsed.error) };
    }
    try {
      // redirect()/notFound() throw; let afterCommit jobs run first, then re-throw them
      let navigation: unknown;
      const data = await withUser(async () => {
        try {
          return await handler(parsed.data, user);
        } catch (error) {
          if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_")) {
            navigation = error;
            return undefined as R;
          }
          throw error;
        }
      });
      if (navigation) throw navigation;
      return { ok: true, data };
    } catch (error) {
      if (error instanceof UserError) return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
      // Let Next.js redirects/notFound propagate
      if (error && typeof error === "object" && "digest" in error) throw error;
      const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
      // 42501 = blocked by Row Level Security / missing privilege
      if (code === "42501") return { ok: false, error: "You don't have permission to do that." };
      if (code === "23505") return { ok: false, error: "That already exists — it must be unique." };
      if (code === "23503") return { ok: false, error: "This record is linked to others and can't be changed that way." };
      if (code === "23514") return { ok: false, error: "That value isn't allowed (for example a negative amount or quantity)." };
      console.error("[admin action]", error);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}

/* Shared zod helpers for form inputs */
export const zs = {
  text: (max = 200) => z.string().trim().max(max),
  required: (label: string, max = 200) => z.string().trim().min(1, `${label} is required.`).max(max),
  optional: (max = 500) =>
    z
      .string()
      .trim()
      .max(max)
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
  email: () =>
    z
      .string()
      .trim()
      .max(160)
      .optional()
      .nullable()
      .transform((v) => (v ? v.toLowerCase() : null))
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address."),
  phone: () =>
    z
      .string()
      .trim()
      .max(30)
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => !v || /^\+?[\d\s()-]{7,}$/.test(v), "Enter a valid phone number."),
  date: () =>
    z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date."),
  money: () => z.coerce.number().int("Use whole rupees.").min(0, "Can't be negative.").max(1_000_000_000),
  int: (min = 0) => z.coerce.number().int().min(min),
  uuid: () => z.string().uuid(),
  optUuid: () =>
    z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => !v || /^[0-9a-f-]{36}$/i.test(v), "Invalid selection."),
};
