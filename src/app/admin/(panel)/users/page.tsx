import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, all, cols, many, schema, tbl, type Row } from "@/db";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePage } from "@/lib/auth/session";
import { relativeTime } from "@/lib/format";
import { listParams } from "@/lib/list";
import { staffOptions } from "@/server/lookups";
import { ACCOUNT_STATUS, accountStatus, authInfo, inviteIsOpen } from "@/server/staff-accounts";
import { FilterSelect } from "@/components/admin/interactive";
import { Avatar, Badge, Card, Notice, PageHeader, Table, Tabs, Td, Th } from "@/components/admin/ui";
import { ActiveButton, DeleteRoleButton, InviteButton, LinkStaffButton, PermissionEditor, ResendButton, RoleButton, UserRolesButton } from "./UsersClient";

export const metadata: Metadata = { title: "Users & Roles" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requirePage("users.manage");
  const { str } = listParams(await searchParams);
  const tab = str("tab") === "roles" ? "roles" : "users";
  const [roles, links, staff] = await Promise.all([
    many<Row<typeof schema.roles> & { perms: { key: string }[] }>(adminDb.from(tbl(schema.roles)).select(`${cols(schema.roles)},perms:role_permissions(key:permission_key)`).order("is_system", { ascending: false }).order("name")),
    all<{ userId: string; roleId: string }>(() => adminDb.from(tbl(schema.userRoles)).select("userId:user_id,roleId:role_id").order("user_id")),
    staffOptions(),
  ]);
  const roleOptions = roles.filter((r) => r.key !== "SUPER_ADMIN" || me.roleKeys.includes("SUPER_ADMIN")).map((r) => ({ value: r.id, label: r.name }));

  return (
    <>
      <PageHeader title="Users & Roles" description="Who can sign in to the admin and what each role may do. Every permission is enforced by the database." actions={tab === "users" ? <InviteButton roles={roleOptions} staff={staff} /> : <RoleButton />} />
      <Tabs
        active={tab}
        items={[
          { key: "users", label: "Users", href: "/admin/users" },
          { key: "roles", label: "Roles & permissions", href: "/admin/users?tab=roles" },
        ]}
      />
      {tab === "users" ? <Users roles={roles} links={links} roleOptions={roleOptions} staff={staff} meId={me.id} filter={str("filter") ?? ""} /> : <Roles roles={roles} links={links} />}
    </>
  );
}

async function Users({
  roles,
  links,
  roleOptions,
  staff,
  meId,
  filter,
}: {
  roles: (Row<typeof schema.roles> & { perms: { key: string }[] })[];
  links: { userId: string; roleId: string }[];
  roleOptions: { value: string; label: string }[];
  staff: { value: string; label: string }[];
  meId: string;
  filter: string;
}) {
  const staffUserIds = [...new Set(links.map((l) => l.userId))];
  const users = staffUserIds.length
    ? await many<Row<typeof schema.profiles> & { s: { name: string } | null }>(adminDb.from(tbl(schema.profiles)).select(`${cols(schema.profiles)},s:staff(name)`).in("id", staffUserIds).order("full_name"))
    : [];
  const auth = await authInfo(users.map((u) => u.id));
  const rows = users.map((u) => {
    const keys = links.filter((l) => l.userId === u.id).map((l) => roles.find((r) => r.id === l.roleId)?.key);
    return { u, keys, status: accountStatus(u, auth.get(u.id)), info: auth.get(u.id) };
  });
  const FILTERS: Record<string, (r: (typeof rows)[number]) => boolean> = {
    admins: (r) => r.keys.some((k) => k === "ADMIN" || k === "SUPER_ADMIN"),
    managers: (r) => r.keys.includes("MANAGER"),
    event_managers: (r) => r.keys.includes("EVENT_MANAGER"),
    staff: (r) => r.keys.includes("STAFF"),
    pending: (r) => inviteIsOpen(r.status),
    suspended: (r) => r.status === "SUSPENDED",
  };
  const shown = FILTERS[filter] ? rows.filter(FILTERS[filter]) : rows;
  return (
    <Card bodyClassName="p-0">
      <div className="border-b border-a-border px-4 py-3">
        <FilterSelect
          param="filter"
          label="Show"
          allLabel="All users"
          options={[
            { value: "admins", label: "Administrators" },
            { value: "managers", label: "Managers" },
            { value: "event_managers", label: "Event managers" },
            { value: "staff", label: "Staff" },
            { value: "pending", label: "Pending invitations" },
            { value: "suspended", label: "Suspended accounts" },
          ]}
        />
      </div>
      <Table>
        <thead>
          <tr>
            <Th>User</Th>
            <Th>Roles</Th>
            <Th>Team member</Th>
            <Th>Account</Th>
            <Th>Last sign-in</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {shown.map(({ u, status, info }) => {
            const mine = links.filter((l) => l.userId === u.id).map((l) => roles.find((r) => r.id === l.roleId)!).filter(Boolean);
            return (
              <tr key={u.id} className={u.active ? undefined : "text-a-muted"}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.fullName || u.email} />
                    <div>
                      <p className="font-medium">
                        {u.fullName || "—"} {u.id === meId && <span className="text-xs text-a-muted">(you)</span>}
                      </p>
                      <p className="text-xs text-a-muted">{u.email}</p>
                    </div>
                    {!u.active && <Badge tone="danger">Deactivated</Badge>}
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {mine.map((r) => (
                      <Badge key={r.id} tone={r.key === "SUPER_ADMIN" ? "gold" : "neutral"} icon={false}>
                        {r.name}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td className="text-xs">{u.staffId && u.s ? <Link href={`/admin/staff/${u.staffId}`} className="hover:underline">{u.s.name}</Link> : "—"}</Td>
                <Td>
                  <Badge tone={ACCOUNT_STATUS[status].tone}>{ACCOUNT_STATUS[status].label}</Badge>
                  {info?.invitedAt && inviteIsOpen(status) && <span className="mt-0.5 block text-xs text-a-muted">Invited {relativeTime(info.invitedAt)}</span>}
                </Td>
                <Td className="text-xs">{info?.lastSignInAt ? relativeTime(info.lastSignInAt) : u.lastSeenAt ? `Active ${relativeTime(u.lastSeenAt)}` : "Never"}</Td>
                <Td className="text-right">
                  <span className="inline-flex">
                    {inviteIsOpen(status) && <ResendButton userId={u.id} />}
                    <UserRolesButton userId={u.id} roles={roleOptions} current={mine.map((r) => r.id)} />
                    <LinkStaffButton userId={u.id} staff={staff} current={u.staffId} />
                    {u.id !== meId && <ActiveButton userId={u.id} active={u.active} />}
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="px-4 py-3 text-xs text-a-muted">
        Passwords are never stored here — Supabase Auth handles sign-in and resets.
      </p>
    </Card>
  );
}

function Roles({ roles, links }: { roles: (Row<typeof schema.roles> & { perms: { key: string }[] })[]; links: { userId: string; roleId: string }[] }) {
  const groups = Object.entries(
    Object.entries(PERMISSIONS).reduce<Record<string, { key: string; label: string }[]>>((acc, [key, p]) => {
      (acc[p.group] ??= []).push({ key, label: p.label });
      return acc;
    }, {}),
  ).map(([group, items]) => ({ group, items }));
  return (
    <div className="space-y-4">
      <Notice tone="info">Permission changes apply on each user&rsquo;s next page load. The database checks the same permissions for every read and write.</Notice>
      {roles.map((r) => (
        <details key={r.id} className="group rounded-xl border border-a-border bg-a-surface">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {r.name} {r.isSystem && <Badge icon={false}>Built-in</Badge>}
              </p>
              <p className="text-[13px] text-a-muted">{r.description}</p>
            </div>
            <span className="text-xs text-a-muted">
              {r.key === "SUPER_ADMIN" ? "All" : r.perms.length} permissions · {links.filter((l) => l.roleId === r.id).length} users
            </span>
            <RoleButton values={r} />
            {!r.isSystem && <DeleteRoleButton id={r.id} />}
          </summary>
          <div className="border-t border-a-border p-4">
            <PermissionEditor roleId={r.id} groups={groups} current={r.perms.map((p) => p.key)} locked={r.key === "SUPER_ADMIN"} />
          </div>
        </details>
      ))}
    </div>
  );
}
