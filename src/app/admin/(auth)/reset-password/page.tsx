import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ResetForm } from "../AuthForms";
import AuthShell from "../AuthShell";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from a reset or invitation email (via /auth/confirm, which signs the user in). */
export default async function ResetPasswordPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/admin/login?error=link");
  return (
    <AuthShell title="Choose a new password" description={`For ${data.user.email}`}>
      <ResetForm />
    </AuthShell>
  );
}
