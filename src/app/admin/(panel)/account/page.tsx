import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { adminDb, cols, many, one, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDateTime, relativeTime } from "@/lib/format";
import { ActionForm, ConfirmButton, TextField } from "@/components/admin/interactive";
import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { changePassword, signOutOtherDevices, updateProfile } from "./actions";

export const metadata: Metadata = { title: "My account" };

type AuthSession = { id: string; created_at: Date; updated_at: Date | null; user_agent: string | null };

export default async function AccountPage() {
  const user = await requirePage();
  const profile = await one<Row<typeof schema.profiles>>(adminDb.from(tbl(schema.profiles)).select(cols(schema.profiles)).eq("id", user.id));
  // Supabase Auth sessions live in the auth schema, which the API doesn't expose — none are listed
  const sessions: AuthSession[] = [];
  const attempts = await many<Row<typeof schema.loginAttempts>>(
    adminDb.from(tbl(schema.loginAttempts)).select(cols(schema.loginAttempts)).eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
  );

  return (
    <>
      <PageHeader title="My account" description={`${user.email} · ${user.roleName}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Profile">
          <ActionForm action={updateProfile} submitLabel="Save profile" success="Profile updated">
            <TextField label="Name" name="fullName" defaultValue={profile.fullName} required />
            <TextField label="Phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} />
          </ActionForm>
        </Card>
        <Card title="Password" description="At least 10 characters with letters and a number. Changing it signs out your other devices.">
          <ActionForm action={changePassword} submitLabel="Change password" success="Password changed" resetOnSuccess>
            <TextField label="Current password" name="current" type="password" autoComplete="current-password" required />
            <TextField label="New password" name="password" type="password" autoComplete="new-password" required />
            <TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
          </ActionForm>
        </Card>
        <Card
          title="Signed-in devices"
          className="lg:col-span-2"
          actions={
            <ConfirmButton action={signOutOtherDevices.bind(null, {})} title="Sign out all other devices?" confirmLabel="Sign out others" success="Other devices signed out" size="sm" icon={<LogOut />}>
              Sign out other devices
            </ConfirmButton>
          }
        >
          {sessions.length === 0 ? (
            <p className="text-[13px] text-a-muted">Session details are available when connected to Supabase.</p>
          ) : (
            <ul className="divide-y divide-a-border">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{s.user_agent ?? "Unknown device"}</p>
                    <p className="text-xs text-a-muted">
                      Signed in {fmtDateTime(s.created_at)} · active {relativeTime(s.updated_at ?? s.created_at)}
                    </p>
                  </div>
                  {s.id === user.sessionId && <Badge tone="success">This device</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent sign-in attempts" className="lg:col-span-2">
          <ul className="divide-y divide-a-border">
            {attempts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="truncate text-a-muted">{a.userAgent ?? "Unknown device"}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-a-muted">{fmtDateTime(a.createdAt)}</span>
                  <Badge tone={a.success ? "success" : "danger"}>{a.success ? "Signed in" : "Failed"}</Badge>
                </span>
              </li>
            ))}
            {attempts.length === 0 && <li className="py-2 text-[13px] text-a-muted">No sign-ins recorded yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
