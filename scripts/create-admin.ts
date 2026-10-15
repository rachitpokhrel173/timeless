/**
 * Create the first administrator (or grant a role to an existing user) in Supabase Auth.
 *
 *   npm run admin:create -- --email owner@example.com --name "Owner Name"            (sends an invite email)
 *   npm run admin:create -- --email owner@example.com --name "Owner Name" --role ADMIN
 *
 * The user receives Supabase's invitation email and chooses their own password through
 * /admin/reset-password — no password is ever passed on the command line or stored here.
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL.
 *
 * Without the CLI: create the user in the Supabase dashboard (Authentication → Add user), then
 * run in the SQL editor:
 *   insert into public.user_roles (user_id, role_id)
 *   select u.id, r.id from auth.users u, public.roles r
 *   where u.email = 'owner@example.com' and r.key = 'SUPER_ADMIN';
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const name = arg("name") ?? email?.split("@")[0];
  const roleKey = arg("role") ?? "SUPER_ADMIN";
  if (!email) throw new Error('Usage: npm run admin:create -- --email you@example.com --name "Your Name" [--role SUPER_ADMIN]');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see README).");
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {}, prepare: false });
  try {
    const [role] = await sql`select id, name from public.roles where key = ${roleKey}`;
    if (!role) throw new Error(`Role ${roleKey} not found — run the migrations first.`);

    let [user] = await sql`select id from auth.users where lower(email) = ${email}`;
    if (!user) {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name: name },
        redirectTo: `${site}/admin/accept-invitation`,
      });
      if (error || !data.user) throw new Error(`Couldn't invite ${email}: ${error?.message}`);
      user = { id: data.user.id };
      console.log(`Invitation sent to ${email}. They choose their password from the email link.`);
    } else {
      console.log(`${email} already exists in Supabase Auth.`);
    }
    await sql`insert into public.profiles (id, email, full_name) values (${user.id}, ${email}, ${name ?? ""})
              on conflict (id) do update set full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name), active = true`;
    await sql`insert into public.user_roles (user_id, role_id) values (${user.id}, ${role.id}) on conflict do nothing`;
    await sql`insert into public.activity_logs (action, entity, entity_id, summary, user_name) values ('role_grant', 'user', ${user.id}, ${`Granted ${role.name} to ${email} (CLI)`}, 'System')`;
    console.log(`${email} now has the ${role.name} role.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
