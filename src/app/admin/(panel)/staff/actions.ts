"use server";

import { z } from "zod";
import { adminDb, db, DbError, exec, many, maybe, one, rpc, schema, tbl, vals, withUser } from "@/db";
import { adminAction, UserError, zs, type ActionResult } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { storeUpload, UploadError } from "@/server/media";
import { notify } from "@/server/notifications";
import { provisionLogin, replaceRole, resendInvitation, syncAuthBan, type StepResult } from "@/server/staff-accounts";
import { deleteStoredFile } from "@/server/storage";

const time = () =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.slice(0, 5) : null));

const EMPLOYMENT = z
  .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE", "INTERN", ""])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const skills = () =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .nullable()
    .transform((v) =>
      (Array.isArray(v) ? v : (v ?? "").split(","))
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s, i, a) => a.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
        .slice(0, 20),
    )
    .refine((v) => v.every((s) => s.length <= 40), "Keep each skill under 40 characters.");

/** Employee fields shared by the edit form and the Add team member wizard. */
const employee = {
  name: zs.required("Full name", 120),
  role: zs.optional(80),
  department: zs.optional(80),
  employeeCode: z
    .string()
    .trim()
    .max(30, "Up to 30 characters.")
    .optional()
    .nullable()
    .transform((v) => (v ? v.toUpperCase() : null))
    .refine((v) => !v || /^[A-Z0-9][A-Z0-9_-]*$/.test(v), "Letters, numbers, - and _ only."),
  employmentType: EMPLOYMENT,
  joinedOn: zs.date(),
  phone: zs.phone(),
  email: zs.email(),
  skills: skills(),
  dailyRate: z.coerce.number().int("Use whole rupees.").min(0, "Can't be negative.").max(1_000_000).optional(),
  notes: zs.optional(2000),
};

const digits = (v: string | null) => (v ?? "").replace(/\D/g, "").slice(-10);

/**
 * Safe duplicate check among current (not archived) team members: same email, same phone number
 * (last 10 digits) or same employee code. Names alone never count — two people can share one.
 */
async function assertNoDuplicate(input: { email: string | null; phone: string | null; employeeCode: string | null }, excludeId: string | null) {
  const people = await many<{ id: string; name: string; email: string | null; phone: string | null; code: string | null; archivedAt: string | null }>(
    adminDb.from(tbl(schema.staff)).select("id,name,email,phone,code:employee_code,archivedAt:archived_at").limit(5000),
  );
  const others = people.filter((p) => p.id !== excludeId);
  const errors: Record<string, string> = {};
  const live = others.filter((p) => !p.archivedAt);
  const byEmail = input.email && live.find((p) => p.email?.toLowerCase() === input.email);
  if (byEmail) errors.email = `${byEmail.name} already uses this email.`;
  const phone = digits(input.phone);
  const byPhone = phone.length >= 7 && live.find((p) => digits(p.phone) === phone);
  if (byPhone) errors.phone = `${byPhone.name} already uses this phone number.`;
  // Codes stay unique even across archived people (the database enforces it too)
  const byCode = input.employeeCode && others.find((p) => p.code?.toUpperCase() === input.employeeCode);
  if (byCode) errors.employeeCode = `${byCode.name} already has this code.`;
  if (Object.keys(errors).length) throw new UserError("This looks like an existing team member.", errors);
}

/** Readable messages from the account functions; everything else stays masked. */
async function dbStep<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DbError && (error.code === "P0001" || error.code === "42501")) throw new UserError(error.message);
    throw error;
  }
}

function staffValues(input: z.infer<z.ZodObject<typeof employee>>, user: SessionUser) {
  const { dailyRate, ...rest } = input;
  // Day rates are financial: only people who see expenses can set them
  return vals(schema.staff, { ...rest, ...(dailyRate !== undefined && user.permissions.has("expenses.view") ? { dailyRate } : {}) });
}

export const saveStaff = adminAction(
  "staff.manage",
  z.object({ id: zs.optUuid(), ...employee, active: z.boolean().default(true) }),
  async ({ id, active, ...input }, user) => {
    await assertNoDuplicate(input, id);
    const t = db.from(tbl(schema.staff));
    const values = { ...staffValues(input, user), active };
    const row = id ? await one<{ id: string }>(t.update(values).eq("id", id).select("id")) : await one<{ id: string }>(t.insert(values).select("id"));
    await audit(user, id ? "update" : "create", "staff", row.id, `${id ? "Updated" : "Added"} team member ${input.name}`);
    return { id: row.id };
  },
);

/**
 * Add team member wizard: create the employee, then (optionally) invite them or link an existing
 * login, then give it the role. Each step reports its own result: if the invitation goes out but
 * the link fails, the employee and the account both exist and the Login tab finishes the job —
 * nothing is created twice when it's retried.
 */
export const createTeamMember = adminAction(
  "staff.manage",
  z
    .object({
      ...employee,
      loginMode: z.enum(["none", "invite", "link"]).default("none"),
      loginEmail: zs.email(),
      loginUserId: zs.optUuid(),
      roleKey: z.string().trim().max(40).default("STAFF"),
    })
    .refine((v) => v.loginMode !== "invite" || !!(v.loginEmail ?? v.email), { message: "Enter the email to invite.", path: ["loginEmail"] })
    .refine((v) => v.loginMode !== "link" || !!v.loginUserId, { message: "Choose the account to link.", path: ["loginUserId"] }),
  async ({ loginMode, loginEmail, loginUserId, roleKey, ...input }, user) => {
    if (loginMode !== "none" && !user.permissions.has("staff.invite") && !user.permissions.has("users.manage"))
      throw new UserError("You can add the team member, but giving them a login needs an administrator.");
    if (loginMode !== "none" && roleKey !== "STAFF" && !user.permissions.has("users.manage")) throw new UserError("Only an administrator can give a role other than Staff.", { roleKey: "Not allowed." });
    await assertNoDuplicate(input, null);
    const row = await one<{ id: string }>(db.from(tbl(schema.staff)).insert({ ...staffValues(input, user), active: true }).select("id"));
    await audit(user, "create", "staff", row.id, `Added team member ${input.name}`);
    const steps: StepResult[] = [{ step: "Employee profile", ok: true, message: `${input.name} was added to the team.` }];
    if (loginMode === "invite") steps.push(...(await provisionLogin({ id: row.id, name: input.name }, { mode: "invite", email: (loginEmail ?? input.email)! }, roleKey, user)));
    if (loginMode === "link") steps.push(...(await provisionLogin({ id: row.id, name: input.name }, { mode: "link", userId: loginUserId! }, roleKey, user)));
    return { id: row.id, steps };
  },
);

export const archiveStaff = adminAction("staff.manage", z.object({ id: zs.uuid(), archived: z.boolean() }), async ({ id, archived }, user) => {
  const s = await one<{ name: string }>(db.from(tbl(schema.staff)).update({ archived_at: archived ? new Date().toISOString() : null, active: !archived }).eq("id", id).select("name"));
  await audit(user, archived ? "archive" : "restore", "staff", id, `${archived ? "Archived" : "Restored"} ${s.name}`);
});

export const setAvailability = adminAction(
  "staff.manage",
  z.object({
    staffId: zs.uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
    until: zs.date(),
    status: z.enum(["AVAILABLE", "UNAVAILABLE", "LEAVE"]),
    startTime: time(),
    endTime: time(),
    note: zs.optional(300),
  }),
  async ({ until, ...input }, user) => {
    const last = until && until > input.date ? until : input.date;
    const days: string[] = [];
    for (let d = new Date(`${input.date}T00:00:00Z`); d.toISOString().slice(0, 10) <= last; d = new Date(d.getTime() + 86_400_000)) days.push(d.toISOString().slice(0, 10));
    if (days.length > 60) throw new UserError("Set up to 60 days at a time.", { until: "Too long." });
    await exec(
      db.from(tbl(schema.staffAvailability)).upsert(
        days.map((date) => vals(schema.staffAvailability, { ...input, date })),
        { onConflict: "staff_id,date" },
      ),
    );
    await audit(user, "availability", "staff", input.staffId, `Marked ${input.status.toLowerCase()} for ${days.length} day(s) from ${input.date}`);
  },
);

export const clearAvailability = adminAction("staff.manage", z.object({ id: zs.uuid() }), async ({ id }) => {
  await exec(db.from(tbl(schema.staffAvailability)).delete().eq("id", id));
});

/* ───────── Login & permissions ───────── */

const staffName = async (id: string) => {
  const s = await maybe<{ id: string; name: string; archivedAt: string | null }>(adminDb.from(tbl(schema.staff)).select("id,name,archivedAt:archived_at").eq("id", id));
  if (!s) throw new UserError("Team member not found.");
  return s;
};
const loginOf = (staffId: string) => maybe<{ id: string; email: string }>(adminDb.from(tbl(schema.profiles)).select("id,email").eq("staff_id", staffId));

export const inviteStaffLogin = adminAction(
  ["staff.invite", "users.manage"],
  z.object({ staffId: zs.uuid(), email: z.string().trim().toLowerCase().email("Enter a valid email."), roleKey: z.string().trim().max(40).default("STAFF") }),
  async ({ staffId, email, roleKey }, user) => {
    const s = await staffName(staffId);
    if (await loginOf(staffId)) throw new UserError("They already have a login.");
    const steps = await provisionLogin(s, { mode: "invite", email }, roleKey, user);
    return { steps };
  },
);

export const linkExistingLogin = adminAction(
  ["staff.invite", "users.manage"],
  z.object({ staffId: zs.uuid(), userId: zs.uuid(), roleKey: z.string().trim().max(40).default("STAFF") }),
  async ({ staffId, userId, roleKey }, user) => {
    const s = await staffName(staffId);
    const steps = await provisionLogin(s, { mode: "link", userId }, roleKey, user);
    return { steps };
  },
);

export const resendStaffInvitation = adminAction(["staff.invite", "users.manage"], z.object({ staffId: zs.uuid() }), async ({ staffId }, user) => {
  const login = await loginOf(staffId);
  if (!login) throw new UserError("They don't have a login yet — send an invitation instead.");
  const r = await resendInvitation(login.id, staffId, user);
  return { email: r.email };
});

export const unlinkStaffLogin = adminAction(["staff.invite", "users.manage"], z.object({ staffId: zs.uuid() }), async ({ staffId }, user) => {
  const s = await staffName(staffId);
  const userId = await dbStep(() => rpc<string>(db, "unlink_staff_login", { p_staff: staffId }));
  await audit(user, "unlink", "staff", staffId, `Unlinked the login from ${s.name}`, { userId });
});

export const setStaffLoginActive = adminAction(["staff.invite", "users.manage"], z.object({ staffId: zs.uuid(), active: z.boolean() }), async ({ staffId, active }, user) => {
  const s = await staffName(staffId);
  const userId = await dbStep(() => rpc<string>(db, "set_staff_login_active", { p_staff: staffId, p_active: active }));
  await syncAuthBan(userId, active);
  await audit(user, active ? "activate" : "suspend", "staff", staffId, `${active ? "Reactivated" : "Suspended"} the login of ${s.name}`, { userId });
  if (active) await notify({ type: "account.reactivated", title: "Your account has been reactivated", userId, href: "/admin" });
});

export const changeStaffRole = adminAction("users.manage", z.object({ staffId: zs.uuid(), roleKey: z.string().trim().min(1, "Choose a role.").max(40) }), async ({ staffId, roleKey }, user) => {
  const s = await staffName(staffId);
  const login = await loginOf(staffId);
  if (!login) throw new UserError("They don't have a login yet.");
  const r = await replaceRole(login.id, roleKey, user);
  if (r.changed) await audit(user, "role_change", "staff", staffId, `${s.name}: role ${r.from.join(", ") || "none"} → ${r.to}`);
  return r;
});

/* ───────── Profile photo (public avatars bucket, like the team photos already shown to planners) ───────── */

const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function uploadStaffPhoto(form: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user?.isStaff) return { ok: false, error: "Your session has ended. Please sign in again." };
  if (!user.permissions.has("staff.manage")) return { ok: false, error: "You don't have permission to do that." };
  const staffId = form.get("staffId");
  const file = form.getAll("file").find((f): f is File => f instanceof File && f.size > 0);
  if (typeof staffId !== "string" || !/^[0-9a-f-]{36}$/i.test(staffId)) return { ok: false, error: "Team member not found." };
  if (!file) return { ok: false, error: "Choose a photo." };
  if (!PHOTO_TYPES.includes(file.type)) return { ok: false, error: "Use a JPG, PNG or WEBP photo." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Photos must be 5 MB or smaller." };
  try {
    return {
      ok: true,
      data: await withUser(async () => {
        const s = await one<{ name: string; photoId: string | null }>(db.from(tbl(schema.staff)).select("name,photoId:photo_id").eq("id", staffId));
        const m = await storeUpload(file, { bucket: "avatars", folder: "staff", alt: s.name, title: s.name, uploadedBy: user.id, imagesOnly: true });
        await exec(db.from(tbl(schema.staff)).update({ photo_id: m.id }).eq("id", staffId));
        if (s.photoId) {
          const old = await maybe<{ bucket: string; path: string }>(adminDb.from(tbl(schema.media)).update({ deleted_at: new Date().toISOString() }).eq("id", s.photoId).select("bucket,path"));
          if (old) await deleteStoredFile(old.bucket, old.path).catch(() => {});
        }
        await audit(user, "update", "staff", staffId, `Updated the profile photo of ${s.name}`);
        return { id: m.id };
      }),
    };
  } catch (error) {
    if (error instanceof UploadError || error instanceof UserError) return { ok: false, error: error.message };
    console.error("[staff photo]", error);
    return { ok: false, error: "The photo couldn't be uploaded. Please try again." };
  }
}
