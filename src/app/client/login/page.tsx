import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "../../admin/(auth)/AuthForms";
import AuthShell from "../../admin/(auth)/AuthShell";

export const metadata: Metadata = { title: "Sign in" };

export default async function ClientLoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.isStaff ? "/admin" : "/client");
  return (
    <AuthShell title="Your events" description="Sign in to see your quotations, bookings, payments and designs.">
      <LoginForm next="/client" />
      <p className="mt-6 text-center text-xs text-a-muted">Your login is created by our team when you book. Forgot your password? Use the link above.</p>
    </AuthShell>
  );
}
