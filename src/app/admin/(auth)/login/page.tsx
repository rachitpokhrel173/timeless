import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "../AuthForms";
import AuthShell from "../AuthShell";
import EmailLinkForwarder from "../EmailLinkForwarder";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const user = await getCurrentUser();
  if (user) redirect(user.isStaff ? "/admin" : "/client");
  const { next, error } = await searchParams;
  return (
    <AuthShell title="Welcome back" description="Sign in to the Timeless Ties studio to manage events, clients and the website.">
      <EmailLinkForwarder />
      <LoginForm next={typeof next === "string" ? next : undefined} notice={error === "link" ? "That link is invalid or has expired. Request a new one." : undefined} />
      <p className="mt-6 text-center text-xs leading-relaxed text-a-muted">Need an account? Ask an administrator to invite you from System → Users &amp; Roles.</p>
    </AuthShell>
  );
}
