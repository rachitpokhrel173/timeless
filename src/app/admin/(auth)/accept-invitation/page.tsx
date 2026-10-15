import type { Metadata } from "next";
import { emailLinkSession } from "@/lib/auth/session";
import AuthShell from "../AuthShell";
import AcceptInvitationForm from "./AcceptInvitationForm";

export const metadata: Metadata = { title: "Accept invitation", robots: { index: false, follow: false } };

/**
 * Where the "Accept invitation" email lands. Two link styles are supported:
 *  - ?token_hash=…&type=invite (branded template in supabase/templates/invite.html): the token is
 *    verified only when the form is submitted, so link scanners can't use it up;
 *  - #access_token=… (Supabase's default template): the browser stores the session, then the
 *    server sees it on refresh.
 */
export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token_hash, type } = await searchParams;
  const tokenHash = typeof token_hash === "string" && (type === undefined || type === "invite") ? token_hash.slice(0, 200) : undefined;
  const session = tokenHash ? null : await emailLinkSession();

  return (
    <AuthShell title="Set your password" description="You’ve been invited to Timeless Ties Events & Decor. Choose a password to finish setting up your account.">
      <AcceptInvitationForm tokenHash={tokenHash} email={session?.email ?? undefined} hasSession={!!session} />
    </AuthShell>
  );
}
