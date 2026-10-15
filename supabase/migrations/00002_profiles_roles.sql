-- 00002_profiles_roles.sql — Profiles (linked to Supabase Auth), roles, permissions, login attempts
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- Tables
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"ip_hash" text,
	"user_agent" text,
	"success" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"group_name" text NOT NULL,
	"label" text NOT NULL
);
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"avatar_path" text,
	"staff_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);

-- Foreign keys
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;

-- Indexes
CREATE INDEX "login_attempts_created_idx" ON "login_attempts" USING btree ("created_at");
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email","created_at");
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");

-- Permissions and built-in roles (keep in sync with src/lib/auth/permissions.ts)

insert into public.permissions (key, group_name, label) values
  ('dashboard.view', 'Overview', 'View dashboard'),
  ('leads.view', 'Sales', 'View leads, inquiries & follow-ups'),
  ('leads.create', 'Sales', 'Create leads'),
  ('leads.update', 'Sales', 'Update leads, inquiries & follow-ups'),
  ('leads.delete', 'Sales', 'Delete leads & inquiries'),
  ('customers.view', 'Customers', 'View customers'),
  ('customers.create', 'Customers', 'Create customers'),
  ('customers.update', 'Customers', 'Update customers'),
  ('customers.delete', 'Customers', 'Delete customers'),
  ('quotations.view', 'Quotations', 'View quotations'),
  ('quotations.create', 'Quotations', 'Create quotations'),
  ('quotations.update', 'Quotations', 'Edit & send quotations'),
  ('quotations.delete', 'Quotations', 'Delete quotations'),
  ('quotations.approve', 'Quotations', 'Approve quotations & convert to bookings'),
  ('bookings.view', 'Bookings', 'View bookings'),
  ('bookings.create', 'Bookings', 'Create bookings'),
  ('bookings.update', 'Bookings', 'Update bookings'),
  ('bookings.cancel', 'Bookings', 'Cancel bookings'),
  ('events.view', 'Events', 'View events, calendar & tasks'),
  ('events.create', 'Events', 'Create events'),
  ('events.update', 'Events', 'Plan events: team, vendors, timeline, designs'),
  ('events.delete', 'Events', 'Delete events'),
  ('tasks.update', 'Events', 'Update tasks assigned to the team'),
  ('inventory.view', 'Inventory', 'View inventory'),
  ('inventory.create', 'Inventory', 'Add inventory items'),
  ('inventory.update', 'Inventory', 'Edit inventory items & packages'),
  ('inventory.adjust', 'Inventory', 'Adjust stock & reservations'),
  ('vendors.view', 'Vendors', 'View vendors'),
  ('vendors.manage', 'Vendors', 'Manage vendors & vendor bookings'),
  ('staff.view', 'Staff', 'View staff & availability'),
  ('staff.manage', 'Staff', 'Manage staff & availability'),
  ('invoices.view', 'Finance', 'View invoices'),
  ('invoices.create', 'Finance', 'Create invoices'),
  ('invoices.update', 'Finance', 'Edit, send & cancel invoices'),
  ('payments.view', 'Finance', 'View payments'),
  ('payments.create', 'Finance', 'Record & void payments'),
  ('expenses.view', 'Finance', 'View expenses & profitability'),
  ('expenses.create', 'Finance', 'Record expenses & vendor payments'),
  ('documents.view', 'Documents', 'View private documents'),
  ('documents.manage', 'Documents', 'Upload & share documents'),
  ('reports.view', 'Reports', 'View reports & analytics'),
  ('marketing.manage', 'Reports', 'Manage campaigns, sources & coupons'),
  ('cms.view', 'Website', 'View website content'),
  ('cms.manage', 'Website', 'Edit website content, gallery & media'),
  ('settings.manage', 'System', 'Business settings, automations & backups'),
  ('users.manage', 'System', 'Manage users & roles'),
  ('audit.view', 'System', 'View activity logs & security')
on conflict (key) do update set group_name = excluded.group_name, label = excluded.label;

insert into public.roles (key, name, description, is_system) values
  ('SUPER_ADMIN', 'Super Admin', 'Full access, including granting Super Admin.', true),
  ('ADMIN', 'Admin', 'Runs the business day to day. Everything except creating Super Admins.', true),
  ('MANAGER', 'Manager', 'Sales, events, inventory and finance — no users, roles or system settings.', true),
  ('SALES', 'Sales', 'Leads, customers, quotations and new bookings.', true),
  ('EVENT_MANAGER', 'Event Manager', 'Plans and runs events: schedules, tasks, inventory, vendors and the team.', true),
  ('ACCOUNTANT', 'Accountant', 'Invoices, payments, expenses and financial reports.', true),
  ('EDITOR', 'Website Editor', 'Website content, gallery, media, testimonials and SEO.', true),
  ('STAFF', 'Staff', 'Sees events, the calendar and their tasks; can update tasks.', true)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, v.permission_key from (values
  ('SUPER_ADMIN', 'dashboard.view'),
  ('SUPER_ADMIN', 'leads.view'),
  ('SUPER_ADMIN', 'leads.create'),
  ('SUPER_ADMIN', 'leads.update'),
  ('SUPER_ADMIN', 'leads.delete'),
  ('SUPER_ADMIN', 'customers.view'),
  ('SUPER_ADMIN', 'customers.create'),
  ('SUPER_ADMIN', 'customers.update'),
  ('SUPER_ADMIN', 'customers.delete'),
  ('SUPER_ADMIN', 'quotations.view'),
  ('SUPER_ADMIN', 'quotations.create'),
  ('SUPER_ADMIN', 'quotations.update'),
  ('SUPER_ADMIN', 'quotations.delete'),
  ('SUPER_ADMIN', 'quotations.approve'),
  ('SUPER_ADMIN', 'bookings.view'),
  ('SUPER_ADMIN', 'bookings.create'),
  ('SUPER_ADMIN', 'bookings.update'),
  ('SUPER_ADMIN', 'bookings.cancel'),
  ('SUPER_ADMIN', 'events.view'),
  ('SUPER_ADMIN', 'events.create'),
  ('SUPER_ADMIN', 'events.update'),
  ('SUPER_ADMIN', 'events.delete'),
  ('SUPER_ADMIN', 'tasks.update'),
  ('SUPER_ADMIN', 'inventory.view'),
  ('SUPER_ADMIN', 'inventory.create'),
  ('SUPER_ADMIN', 'inventory.update'),
  ('SUPER_ADMIN', 'inventory.adjust'),
  ('SUPER_ADMIN', 'vendors.view'),
  ('SUPER_ADMIN', 'vendors.manage'),
  ('SUPER_ADMIN', 'staff.view'),
  ('SUPER_ADMIN', 'staff.manage'),
  ('SUPER_ADMIN', 'invoices.view'),
  ('SUPER_ADMIN', 'invoices.create'),
  ('SUPER_ADMIN', 'invoices.update'),
  ('SUPER_ADMIN', 'payments.view'),
  ('SUPER_ADMIN', 'payments.create'),
  ('SUPER_ADMIN', 'expenses.view'),
  ('SUPER_ADMIN', 'expenses.create'),
  ('SUPER_ADMIN', 'documents.view'),
  ('SUPER_ADMIN', 'documents.manage'),
  ('SUPER_ADMIN', 'reports.view'),
  ('SUPER_ADMIN', 'marketing.manage'),
  ('SUPER_ADMIN', 'cms.view'),
  ('SUPER_ADMIN', 'cms.manage'),
  ('SUPER_ADMIN', 'settings.manage'),
  ('SUPER_ADMIN', 'users.manage'),
  ('SUPER_ADMIN', 'audit.view'),
  ('ADMIN', 'dashboard.view'),
  ('ADMIN', 'leads.view'),
  ('ADMIN', 'leads.create'),
  ('ADMIN', 'leads.update'),
  ('ADMIN', 'leads.delete'),
  ('ADMIN', 'customers.view'),
  ('ADMIN', 'customers.create'),
  ('ADMIN', 'customers.update'),
  ('ADMIN', 'customers.delete'),
  ('ADMIN', 'quotations.view'),
  ('ADMIN', 'quotations.create'),
  ('ADMIN', 'quotations.update'),
  ('ADMIN', 'quotations.delete'),
  ('ADMIN', 'quotations.approve'),
  ('ADMIN', 'bookings.view'),
  ('ADMIN', 'bookings.create'),
  ('ADMIN', 'bookings.update'),
  ('ADMIN', 'bookings.cancel'),
  ('ADMIN', 'events.view'),
  ('ADMIN', 'events.create'),
  ('ADMIN', 'events.update'),
  ('ADMIN', 'events.delete'),
  ('ADMIN', 'tasks.update'),
  ('ADMIN', 'inventory.view'),
  ('ADMIN', 'inventory.create'),
  ('ADMIN', 'inventory.update'),
  ('ADMIN', 'inventory.adjust'),
  ('ADMIN', 'vendors.view'),
  ('ADMIN', 'vendors.manage'),
  ('ADMIN', 'staff.view'),
  ('ADMIN', 'staff.manage'),
  ('ADMIN', 'invoices.view'),
  ('ADMIN', 'invoices.create'),
  ('ADMIN', 'invoices.update'),
  ('ADMIN', 'payments.view'),
  ('ADMIN', 'payments.create'),
  ('ADMIN', 'expenses.view'),
  ('ADMIN', 'expenses.create'),
  ('ADMIN', 'documents.view'),
  ('ADMIN', 'documents.manage'),
  ('ADMIN', 'reports.view'),
  ('ADMIN', 'marketing.manage'),
  ('ADMIN', 'cms.view'),
  ('ADMIN', 'cms.manage'),
  ('ADMIN', 'settings.manage'),
  ('ADMIN', 'users.manage'),
  ('ADMIN', 'audit.view'),
  ('MANAGER', 'dashboard.view'),
  ('MANAGER', 'leads.view'),
  ('MANAGER', 'leads.create'),
  ('MANAGER', 'leads.update'),
  ('MANAGER', 'leads.delete'),
  ('MANAGER', 'customers.view'),
  ('MANAGER', 'customers.create'),
  ('MANAGER', 'customers.update'),
  ('MANAGER', 'customers.delete'),
  ('MANAGER', 'quotations.view'),
  ('MANAGER', 'quotations.create'),
  ('MANAGER', 'quotations.update'),
  ('MANAGER', 'quotations.delete'),
  ('MANAGER', 'quotations.approve'),
  ('MANAGER', 'bookings.view'),
  ('MANAGER', 'bookings.create'),
  ('MANAGER', 'bookings.update'),
  ('MANAGER', 'bookings.cancel'),
  ('MANAGER', 'events.view'),
  ('MANAGER', 'events.create'),
  ('MANAGER', 'events.update'),
  ('MANAGER', 'events.delete'),
  ('MANAGER', 'tasks.update'),
  ('MANAGER', 'inventory.view'),
  ('MANAGER', 'inventory.create'),
  ('MANAGER', 'inventory.update'),
  ('MANAGER', 'inventory.adjust'),
  ('MANAGER', 'vendors.view'),
  ('MANAGER', 'vendors.manage'),
  ('MANAGER', 'staff.view'),
  ('MANAGER', 'staff.manage'),
  ('MANAGER', 'invoices.view'),
  ('MANAGER', 'invoices.create'),
  ('MANAGER', 'invoices.update'),
  ('MANAGER', 'payments.view'),
  ('MANAGER', 'payments.create'),
  ('MANAGER', 'expenses.view'),
  ('MANAGER', 'expenses.create'),
  ('MANAGER', 'documents.view'),
  ('MANAGER', 'documents.manage'),
  ('MANAGER', 'reports.view'),
  ('MANAGER', 'marketing.manage'),
  ('MANAGER', 'cms.view'),
  ('MANAGER', 'cms.manage'),
  ('SALES', 'dashboard.view'),
  ('SALES', 'leads.view'),
  ('SALES', 'leads.create'),
  ('SALES', 'leads.update'),
  ('SALES', 'leads.delete'),
  ('SALES', 'customers.view'),
  ('SALES', 'customers.create'),
  ('SALES', 'customers.update'),
  ('SALES', 'quotations.view'),
  ('SALES', 'quotations.create'),
  ('SALES', 'quotations.update'),
  ('SALES', 'bookings.view'),
  ('SALES', 'bookings.create'),
  ('SALES', 'events.view'),
  ('SALES', 'inventory.view'),
  ('SALES', 'documents.view'),
  ('SALES', 'marketing.manage'),
  ('SALES', 'reports.view'),
  ('EVENT_MANAGER', 'dashboard.view'),
  ('EVENT_MANAGER', 'customers.view'),
  ('EVENT_MANAGER', 'bookings.view'),
  ('EVENT_MANAGER', 'bookings.update'),
  ('EVENT_MANAGER', 'events.view'),
  ('EVENT_MANAGER', 'events.create'),
  ('EVENT_MANAGER', 'events.update'),
  ('EVENT_MANAGER', 'events.delete'),
  ('EVENT_MANAGER', 'tasks.update'),
  ('EVENT_MANAGER', 'inventory.view'),
  ('EVENT_MANAGER', 'inventory.create'),
  ('EVENT_MANAGER', 'inventory.update'),
  ('EVENT_MANAGER', 'inventory.adjust'),
  ('EVENT_MANAGER', 'vendors.view'),
  ('EVENT_MANAGER', 'vendors.manage'),
  ('EVENT_MANAGER', 'staff.view'),
  ('EVENT_MANAGER', 'staff.manage'),
  ('EVENT_MANAGER', 'documents.view'),
  ('EVENT_MANAGER', 'documents.manage'),
  ('ACCOUNTANT', 'dashboard.view'),
  ('ACCOUNTANT', 'customers.view'),
  ('ACCOUNTANT', 'bookings.view'),
  ('ACCOUNTANT', 'events.view'),
  ('ACCOUNTANT', 'vendors.view'),
  ('ACCOUNTANT', 'invoices.view'),
  ('ACCOUNTANT', 'invoices.create'),
  ('ACCOUNTANT', 'invoices.update'),
  ('ACCOUNTANT', 'payments.view'),
  ('ACCOUNTANT', 'payments.create'),
  ('ACCOUNTANT', 'expenses.view'),
  ('ACCOUNTANT', 'expenses.create'),
  ('ACCOUNTANT', 'documents.view'),
  ('ACCOUNTANT', 'documents.manage'),
  ('ACCOUNTANT', 'reports.view'),
  ('EDITOR', 'dashboard.view'),
  ('EDITOR', 'cms.view'),
  ('EDITOR', 'cms.manage'),
  ('STAFF', 'dashboard.view'),
  ('STAFF', 'events.view'),
  ('STAFF', 'tasks.update'),
  ('STAFF', 'inventory.view')
) as v(role_key, permission_key)
join public.roles r on r.key = v.role_key
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- Profiles follow Supabase Auth users
-- ─────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ─────────────────────────────────────────────────────────────
-- Authorisation helpers used by RLS policies.
-- SECURITY DEFINER so they can read role tables without recursive RLS checks;
-- they only ever answer questions about the calling user (auth.uid()).
-- ─────────────────────────────────────────────────────────────

create or replace function public.has_permission(permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and p.active
      and rp.permission_key = permission
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid()) and p.active
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid()) and p.active and r.key = 'SUPER_ADMIN'
  );
$$;

/** Permission keys of the calling user (used by the app to build its menus). */
create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct rp.permission_key
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = (select auth.uid()) and p.active;
$$;

revoke all on function public.has_permission(text) from public;
revoke all on function public.is_staff() from public;
revoke all on function public.is_super_admin() from public;
revoke all on function public.my_permissions() from public;
grant execute on function public.has_permission(text) to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.my_permissions() to authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;
