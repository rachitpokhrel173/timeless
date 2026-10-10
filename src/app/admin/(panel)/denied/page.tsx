import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { requirePage } from "@/lib/auth/session";
import { EmptyState, LinkButton } from "@/components/admin/ui";

export const metadata: Metadata = { title: "No access" };

export default async function DeniedPage({ searchParams }: PageProps<"/admin/denied">) {
  const user = await requirePage();
  const { need } = await searchParams;
  const label = typeof need === "string" && need in PERMISSIONS ? PERMISSIONS[need as Permission].label : null;
  return (
    <div className="rounded-xl border border-a-border bg-a-surface">
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        action={<LinkButton href={user.permissions.has("dashboard.view") ? "/admin" : "/admin/account"}>Go back</LinkButton>}
      >
        Your role ({user.roleName}) doesn&rsquo;t include {label ? <strong>“{label}”</strong> : "this permission"}. Ask an administrator if you need it.
      </EmptyState>
    </div>
  );
}
