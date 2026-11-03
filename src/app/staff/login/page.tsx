import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/redirects";
import { LoginForm } from "@/app/admin/(auth)/AuthForms";
import AuthShell from "@/app/admin/(auth)/AuthShell";
import EmailLinkForwarder from "@/app/admin/(auth)/EmailLinkForwarder";

export const metadata: Metadata = { title: "Staff sign in" };

/**
 * Sign-in for the décor team. Same Supabase Auth account and the same rate-limited, audited login
 * as the back office — only the landing page differs (the staff portal).
 */
export default async function StaffLoginPage({ searchParams }: PageProps<"/staff/login">) {
  const { next, error } = await searchParams;
  const target = safeNextPath(next, "/staff");
  const user = await getCurrentUser();
  if (user) redirect(user.isStaff ? (target.startsWith("/staff") ? target : "/staff") : "/client");
  return (
    <AuthShell title="Team sign in" description="See the work assigned to you, update your progress and send photos when you finish.">
      <EmailLinkForwarder />
      <LoginForm next={target.startsWith("/staff") ? target : "/staff"} notice={error === "link" ? "That link is invalid or has expired. Request a new one." : undefined} />
      <p className="mt-6 text-center text-xs leading-relaxed text-a-muted">No account yet? Ask the office to invite you — you&rsquo;ll get an email to set your password.</p>
    </AuthShell>
  );
}
