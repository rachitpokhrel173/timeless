import type { Metadata } from "next";
import { adminDb, maybe, schema, tbl } from "@/db";
import { requireStaffUser } from "@/server/staff-portal";
import { ActionForm, TextField } from "@/components/admin/interactive";
import { Card } from "@/components/admin/ui";
import { changePassword, updateProfile } from "@/app/admin/(panel)/account/actions";

export const metadata: Metadata = { title: "My account" };

/** Own profile and password — the same audited actions as the admin account page. */
export default async function StaffAccountPage() {
  const user = await requireStaffUser();
  const profile = await maybe<{ fullName: string; phone: string | null }>(adminDb.from(tbl(schema.profiles)).select("fullName:full_name,phone").eq("id", user.id));

  return (
    <>
      <h1 className="font-serif text-3xl font-medium">My account</h1>
      <p className="mt-1 mb-5 text-[14px] text-a-muted">{user.email}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile" description="Your name and phone number as the office sees them.">
          <ActionForm action={updateProfile} submitLabel="Save profile" success="Profile updated">
            <TextField label="Name" name="fullName" defaultValue={profile?.fullName ?? user.name} required />
            <TextField label="Phone" name="phone" type="tel" defaultValue={profile?.phone ?? ""} />
          </ActionForm>
        </Card>
        <Card title="Password" description="At least 12 characters with letters and a number. Changing it signs you out on your other devices.">
          <ActionForm action={changePassword} submitLabel="Change password" success="Password changed" resetOnSuccess>
            <TextField label="Current password" name="current" type="password" autoComplete="current-password" required />
            <TextField label="New password" name="password" type="password" autoComplete="new-password" required />
            <TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
          </ActionForm>
        </Card>
      </div>
      <p className="mt-4 text-[13px] text-a-muted">Forgot your password? Sign out and use &ldquo;Forgot password?&rdquo; on the sign-in page.</p>
    </>
  );
}
