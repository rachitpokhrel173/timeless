import type { Metadata } from "next";
import { ForgotForm } from "../AuthForms";
import AuthShell from "../AuthShell";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" description="We'll email you a link to choose a new one.">
      <ForgotForm />
    </AuthShell>
  );
}
