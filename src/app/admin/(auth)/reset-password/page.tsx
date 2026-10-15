import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { emailLinkSession, getCurrentUser } from "@/lib/auth/session";
import { ResetForm } from "../AuthForms";
import AuthShell from "../AuthShell";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from a reset or invitation email (via /auth/confirm, which signs the user in). */
export default async function ResetPasswordPage() {
  const session = await emailLinkSession();
  if (!session) {
    // Signed in normally (not from an email link): change the password under Account instead
    const user = await getCurrentUser();
    redirect(user ? (user.isStaff ? "/admin/account" : "/client") : "/admin/login?error=link");
  }
  return (
    <AuthShell title="Choose a new password" description={session.email ? `For ${session.email}` : "Choose a password you haven't used before."}>
      <ResetForm />
    </AuthShell>
  );
}
