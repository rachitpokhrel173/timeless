import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "../AuthForms";
import AuthShell from "../AuthShell";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const user = await getCurrentUser();
  if (user) redirect(user.isStaff ? "/admin" : "/client");
  const { next, error } = await searchParams;
  return (
    <AuthShell title="Studio admin" description="Sign in to manage events, clients and the website.">
      <LoginForm next={typeof next === "string" ? next : undefined} notice={error === "link" ? "That link is invalid or has expired. Request a new one." : undefined} />
      <p className="mt-6 text-center text-xs text-a-muted">Accounts are created by an administrator under System → Users &amp; Roles.</p>
    </AuthShell>
  );
}
