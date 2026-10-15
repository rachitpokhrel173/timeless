-- 00013_rls_policies.sql — Row Level Security policies, updated_at triggers and Realtime
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
--
-- Every table has RLS enabled. Access is granted by explicit policies:
--   • staff     — public.has_permission('<key>') for the matching permission
--   • customers — client-portal users see only rows linked to public.current_customer_id()
--   • anon      — only published website content and public settings; no CRM data at all
-- Tables without a policy for a role are invisible to that role. The server's privileged
-- connection (used for automations and validated public form intake) bypasses RLS.
-- ─────────────────────────────────────────────────────────────

-- updated_at triggers for every table that has the column
do $$
declare
  t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t.table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t.table_name);
  end loop;
end;
$$;

-- Enable RLS everywhere in the public schema
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- Helper: standard staff policies (select / insert / update / delete), each guarded by a SQL expression.
create or replace function pg_temp.staff_policies(tbl text, sel text, ins text, upd text, del text)
returns void
language plpgsql
as $$
begin
  if sel is not null then
    execute format('drop policy if exists "staff select" on public.%I', tbl);
    execute format('create policy "staff select" on public.%I for select to authenticated using (%s)', tbl, sel);
  end if;
  if ins is not null then
    execute format('drop policy if exists "staff insert" on public.%I', tbl);
    execute format('create policy "staff insert" on public.%I for insert to authenticated with check (%s)', tbl, ins);
  end if;
  if upd is not null then
    execute format('drop policy if exists "staff update" on public.%I', tbl);
    execute format('create policy "staff update" on public.%I for update to authenticated using (%s) with check (%s)', tbl, upd, upd);
  end if;
  if del is not null then
    execute format('drop policy if exists "staff delete" on public.%I', tbl);
    execute format('create policy "staff delete" on public.%I for delete to authenticated using (%s)', tbl, del);
  end if;
end;
$$;

create or replace function pg_temp.hp(perm text) returns text language sql as $$ select format('public.has_permission(%L)', perm) $$;

-- ───────── Users, roles, audit ─────────

-- Profiles: staff can see colleagues (for assignment pickers); everyone sees themselves.
select pg_temp.staff_policies('profiles', 'public.is_staff() or id = (select auth.uid())', null, pg_temp.hp('users.manage'), null);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- A non-admin updating their own row must not change active / staff link / email
create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.has_permission('users.manage') then
    if new.active is distinct from old.active or new.staff_id is distinct from old.staff_id or new.email is distinct from old.email then
      raise exception 'Only administrators can change this';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();
revoke all on function public.profiles_guard() from public, anon, authenticated;

select pg_temp.staff_policies('roles', 'public.is_staff()', pg_temp.hp('users.manage'), pg_temp.hp('users.manage'), pg_temp.hp('users.manage') || ' and not is_system');
select pg_temp.staff_policies('permissions', 'public.is_staff()', null, null, null);
select pg_temp.staff_policies('role_permissions', 'public.is_staff()', pg_temp.hp('users.manage'), null, pg_temp.hp('users.manage'));
-- Nobody can hand out Super Admin unless they are one
select pg_temp.staff_policies(
  'user_roles',
  'public.is_staff() or user_id = (select auth.uid())',
  pg_temp.hp('users.manage') || ' and (public.is_super_admin() or role_id <> (select id from public.roles where key = ''SUPER_ADMIN''))',
  null,
  pg_temp.hp('users.manage') || ' and (public.is_super_admin() or role_id <> (select id from public.roles where key = ''SUPER_ADMIN''))'
);
select pg_temp.staff_policies('login_attempts', pg_temp.hp('audit.view'), null, null, null);
select pg_temp.staff_policies('activity_logs', pg_temp.hp('audit.view'), 'public.is_staff() and user_id = (select auth.uid())', null, null);

-- ───────── Customers & CRM ─────────

select pg_temp.staff_policies('customers', pg_temp.hp('customers.view'), pg_temp.hp('customers.create') || ' or ' || pg_temp.hp('leads.create') || ' or ' || pg_temp.hp('quotations.create'), pg_temp.hp('customers.update'), pg_temp.hp('customers.delete'));
drop policy if exists "customer reads own record" on public.customers;
create policy "customer reads own record" on public.customers for select to authenticated using (id = public.current_customer_id());
select pg_temp.staff_policies('customer_contacts', pg_temp.hp('customers.view'), pg_temp.hp('customers.update'), pg_temp.hp('customers.update'), pg_temp.hp('customers.update'));

select pg_temp.staff_policies('campaign_sources', 'public.is_staff()', pg_temp.hp('marketing.manage'), pg_temp.hp('marketing.manage'), pg_temp.hp('marketing.manage'));
select pg_temp.staff_policies('campaigns', pg_temp.hp('reports.view') || ' or ' || pg_temp.hp('marketing.manage') || ' or ' || pg_temp.hp('leads.view'), pg_temp.hp('marketing.manage'), pg_temp.hp('marketing.manage'), pg_temp.hp('marketing.manage'));
select pg_temp.staff_policies('coupons', pg_temp.hp('marketing.manage') || ' or ' || pg_temp.hp('quotations.view'), pg_temp.hp('marketing.manage'), pg_temp.hp('marketing.manage') || ' or ' || pg_temp.hp('quotations.update'), pg_temp.hp('marketing.manage'));
select pg_temp.staff_policies('sales_pipeline_stages', 'public.is_staff()', pg_temp.hp('settings.manage'), pg_temp.hp('settings.manage'), pg_temp.hp('settings.manage'));

select pg_temp.staff_policies('leads', pg_temp.hp('leads.view'), pg_temp.hp('leads.create'), pg_temp.hp('leads.update'), pg_temp.hp('leads.delete'));
select pg_temp.staff_policies('inquiries', pg_temp.hp('leads.view'), pg_temp.hp('leads.create'), pg_temp.hp('leads.update'), pg_temp.hp('leads.delete'));
select pg_temp.staff_policies('followups', pg_temp.hp('leads.view') || ' or assigned_to = (select auth.uid())', pg_temp.hp('leads.update'), pg_temp.hp('leads.update') || ' or assigned_to = (select auth.uid())', pg_temp.hp('leads.update'));
select pg_temp.staff_policies('lead_activities', pg_temp.hp('leads.view'), pg_temp.hp('leads.update') || ' or ' || pg_temp.hp('leads.create'), null, pg_temp.hp('leads.delete'));
select pg_temp.staff_policies('internal_notes', 'public.is_staff() and deleted_at is null', 'public.is_staff() and author_id = (select auth.uid())', 'author_id = (select auth.uid()) or ' || pg_temp.hp('users.manage'), null);

-- ───────── Website content (public reads only what is published) ─────────

do $$
declare
  t text;
begin
  foreach t in array array['services', 'packages', 'testimonials', 'gallery_albums', 'gallery_items', 'homepage_sections', 'catalogue_sections', 'catalogue_items', 'price_lists']
  loop
    execute format('drop policy if exists "public reads published" on public.%I', t);
    execute format('create policy "public reads published" on public.%I for select to anon, authenticated using (status = ''PUBLISHED'')', t);
    perform pg_temp.staff_policies(t, pg_temp.hp('cms.view') || ' or ' || pg_temp.hp('cms.manage'), pg_temp.hp('cms.manage'), pg_temp.hp('cms.manage'), pg_temp.hp('cms.manage'));
  end loop;
end;
$$;
-- Testimonials additionally require the customer's consent (samples are flagged and hidden in production by the app)
drop policy if exists "public reads published" on public.testimonials;
create policy "public reads published" on public.testimonials for select to anon, authenticated using (status = 'PUBLISHED' and (consent or placeholder));
-- Packages are also managed from inventory
select pg_temp.staff_policies('packages', pg_temp.hp('cms.view') || ' or ' || pg_temp.hp('inventory.view') || ' or ' || pg_temp.hp('quotations.view'), pg_temp.hp('cms.manage') || ' or ' || pg_temp.hp('inventory.update'), pg_temp.hp('cms.manage') || ' or ' || pg_temp.hp('inventory.update'), pg_temp.hp('cms.manage'));

drop policy if exists "public reads service items" on public.service_items;
create policy "public reads service items" on public.service_items for select to anon, authenticated
  using (exists (select 1 from public.services s where s.id = service_id and s.status = 'PUBLISHED'));
select pg_temp.staff_policies('service_items', pg_temp.hp('cms.view') || ' or ' || pg_temp.hp('cms.manage'), pg_temp.hp('cms.manage'), pg_temp.hp('cms.manage'), pg_temp.hp('cms.manage'));

drop policy if exists "public reads package items" on public.package_items;
create policy "public reads package items" on public.package_items for select to anon, authenticated
  using (exists (select 1 from public.packages p where p.id = package_id and p.status = 'PUBLISHED'));
select pg_temp.staff_policies('package_items', pg_temp.hp('cms.view') || ' or ' || pg_temp.hp('inventory.view'), pg_temp.hp('cms.manage') || ' or ' || pg_temp.hp('inventory.update'), pg_temp.hp('cms.manage') || ' or ' || pg_temp.hp('inventory.update'), pg_temp.hp('cms.manage') || ' or ' || pg_temp.hp('inventory.update'));

do $$
declare
  t text;
begin
  foreach t in array array['social_links', 'seo_settings', 'event_types']
  loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    perform pg_temp.staff_policies(t, null, pg_temp.hp('cms.manage'), pg_temp.hp('cms.manage'), pg_temp.hp('cms.manage'));
  end loop;
end;
$$;

drop policy if exists "public reads public settings" on public.site_settings;
create policy "public reads public settings" on public.site_settings for select to anon, authenticated using (is_public);
select pg_temp.staff_policies('site_settings', 'public.is_staff()', pg_temp.hp('settings.manage') || ' or (is_public and ' || pg_temp.hp('cms.manage') || ')', pg_temp.hp('settings.manage') || ' or (is_public and ' || pg_temp.hp('cms.manage') || ')', pg_temp.hp('settings.manage'));

-- Media rows: public-media files are public by URL anyway; private buckets need staff access.
drop policy if exists "public reads public media" on public.media;
create policy "public reads public media" on public.media for select to anon, authenticated
  using (bucket in ('public-media', 'static') and deleted_at is null);
select pg_temp.staff_policies('media', 'public.is_staff()', 'public.is_staff()', pg_temp.hp('cms.manage') || ' or uploaded_by = (select auth.uid())', pg_temp.hp('cms.manage'));

-- ───────── Inventory, vendors, staff ─────────

select pg_temp.staff_policies('inventory_categories', pg_temp.hp('inventory.view'), pg_temp.hp('inventory.update'), pg_temp.hp('inventory.update'), pg_temp.hp('inventory.update'));
select pg_temp.staff_policies('inventory_items', pg_temp.hp('inventory.view') || ' or ' || pg_temp.hp('quotations.view'), pg_temp.hp('inventory.create'), pg_temp.hp('inventory.update') || ' or ' || pg_temp.hp('inventory.adjust'), pg_temp.hp('inventory.update'));
select pg_temp.staff_policies('inventory_movements', pg_temp.hp('inventory.view'), pg_temp.hp('inventory.adjust') || ' or ' || pg_temp.hp('bookings.update') || ' or ' || pg_temp.hp('inventory.create'), null, null);
select pg_temp.staff_policies('maintenance_records', pg_temp.hp('inventory.view'), pg_temp.hp('inventory.adjust'), pg_temp.hp('inventory.adjust'), pg_temp.hp('inventory.adjust'));
select pg_temp.staff_policies('inventory_reservations', pg_temp.hp('inventory.view') || ' or ' || pg_temp.hp('events.view'), pg_temp.hp('inventory.adjust') || ' or ' || pg_temp.hp('bookings.update') || ' or ' || pg_temp.hp('quotations.approve'), pg_temp.hp('inventory.adjust') || ' or ' || pg_temp.hp('bookings.update') || ' or ' || pg_temp.hp('bookings.cancel'), pg_temp.hp('inventory.adjust'));
select pg_temp.staff_policies('inventory_reservation_items', pg_temp.hp('inventory.view') || ' or ' || pg_temp.hp('events.view'), pg_temp.hp('inventory.adjust') || ' or ' || pg_temp.hp('bookings.update') || ' or ' || pg_temp.hp('quotations.approve'), pg_temp.hp('inventory.adjust') || ' or ' || pg_temp.hp('bookings.update') || ' or ' || pg_temp.hp('bookings.cancel'), pg_temp.hp('inventory.adjust'));

select pg_temp.staff_policies('vendors', pg_temp.hp('vendors.view') || ' or ' || pg_temp.hp('expenses.view'), pg_temp.hp('vendors.manage'), pg_temp.hp('vendors.manage'), pg_temp.hp('vendors.manage'));
select pg_temp.staff_policies('vendor_assignments', pg_temp.hp('vendors.view') || ' or ' || pg_temp.hp('events.view') || ' or ' || pg_temp.hp('expenses.view'), pg_temp.hp('vendors.manage'), pg_temp.hp('vendors.manage'), pg_temp.hp('vendors.manage'));
select pg_temp.staff_policies('staff', 'public.is_staff()', pg_temp.hp('staff.manage'), pg_temp.hp('staff.manage'), pg_temp.hp('staff.manage'));
select pg_temp.staff_policies('staff_availability', pg_temp.hp('staff.view') || ' or ' || pg_temp.hp('events.view'), pg_temp.hp('staff.manage'), pg_temp.hp('staff.manage'), pg_temp.hp('staff.manage'));
select pg_temp.staff_policies('staff_assignments', pg_temp.hp('events.view') || ' or ' || pg_temp.hp('staff.view'), pg_temp.hp('events.update'), pg_temp.hp('events.update'), pg_temp.hp('events.update'));

-- ───────── Quotations, bookings, events (customers see their own) ─────────

select pg_temp.staff_policies('quotations', pg_temp.hp('quotations.view'), pg_temp.hp('quotations.create'), pg_temp.hp('quotations.update') || ' or ' || pg_temp.hp('quotations.approve'), pg_temp.hp('quotations.delete'));
drop policy if exists "customer reads own" on public.quotations;
create policy "customer reads own" on public.quotations for select to authenticated
  using (customer_id = public.current_customer_id() and status <> 'DRAFT' and deleted_at is null);
select pg_temp.staff_policies('quotation_items', pg_temp.hp('quotations.view'), pg_temp.hp('quotations.create') || ' or ' || pg_temp.hp('quotations.update'), pg_temp.hp('quotations.update'), pg_temp.hp('quotations.update') || ' or ' || pg_temp.hp('quotations.create'));
drop policy if exists "customer reads own" on public.quotation_items;
create policy "customer reads own" on public.quotation_items for select to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_id and q.customer_id = public.current_customer_id() and q.status <> 'DRAFT'));
select pg_temp.staff_policies('quotation_versions', pg_temp.hp('quotations.view'), pg_temp.hp('quotations.update') || ' or ' || pg_temp.hp('quotations.create'), null, null);
select pg_temp.staff_policies('quotation_activity', pg_temp.hp('quotations.view'), pg_temp.hp('quotations.update') || ' or ' || pg_temp.hp('quotations.approve'), null, null);

select pg_temp.staff_policies('bookings', pg_temp.hp('bookings.view'), pg_temp.hp('bookings.create') || ' or ' || pg_temp.hp('quotations.approve'), pg_temp.hp('bookings.update') || ' or ' || pg_temp.hp('bookings.cancel') || ' or ' || pg_temp.hp('payments.create'), null);
drop policy if exists "customer reads own" on public.bookings;
create policy "customer reads own" on public.bookings for select to authenticated using (customer_id = public.current_customer_id());
select pg_temp.staff_policies('booking_items', pg_temp.hp('bookings.view'), pg_temp.hp('bookings.create') || ' or ' || pg_temp.hp('quotations.approve'), pg_temp.hp('bookings.update'), pg_temp.hp('bookings.update'));
drop policy if exists "customer reads own" on public.booking_items;
create policy "customer reads own" on public.booking_items for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = public.current_customer_id()));

select pg_temp.staff_policies('events', pg_temp.hp('events.view'), pg_temp.hp('events.create') || ' or ' || pg_temp.hp('bookings.create') || ' or ' || pg_temp.hp('quotations.approve'), pg_temp.hp('events.update') || ' or ' || pg_temp.hp('bookings.update') || ' or ' || pg_temp.hp('bookings.cancel'), pg_temp.hp('events.delete'));
drop policy if exists "customer reads own" on public.events;
create policy "customer reads own" on public.events for select to authenticated using (customer_id = public.current_customer_id());
select pg_temp.staff_policies(
  'event_tasks',
  pg_temp.hp('events.view') || ' or assignee_user_id = (select auth.uid())',
  pg_temp.hp('events.update') || ' or ' || pg_temp.hp('tasks.update'),
  pg_temp.hp('events.update') || ' or (' || pg_temp.hp('tasks.update') || ' and (assignee_user_id = (select auth.uid()) or assignee_staff_id = (select staff_id from public.profiles where id = (select auth.uid()))))',
  pg_temp.hp('events.update')
);
select pg_temp.staff_policies('checklist_templates', pg_temp.hp('events.view'), pg_temp.hp('settings.manage') || ' or ' || pg_temp.hp('events.update'), pg_temp.hp('settings.manage') || ' or ' || pg_temp.hp('events.update'), pg_temp.hp('settings.manage'));
select pg_temp.staff_policies('event_timeline', pg_temp.hp('events.view'), pg_temp.hp('events.update'), pg_temp.hp('events.update') || ' or ' || pg_temp.hp('tasks.update'), pg_temp.hp('events.update'));
drop policy if exists "customer reads own" on public.event_timeline;
create policy "customer reads own" on public.event_timeline for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.customer_id = public.current_customer_id()));
select pg_temp.staff_policies('event_notes', pg_temp.hp('events.view'), pg_temp.hp('events.update') || ' or ' || pg_temp.hp('tasks.update'), 'author_id = (select auth.uid())', pg_temp.hp('events.update'));
drop policy if exists "customer reads shared notes" on public.event_notes;
create policy "customer reads shared notes" on public.event_notes for select to authenticated
  using (visibility = 'CLIENT' and exists (select 1 from public.events e where e.id = event_id and e.customer_id = public.current_customer_id()));
select pg_temp.staff_policies('design_approvals', pg_temp.hp('events.view'), pg_temp.hp('events.update'), pg_temp.hp('events.update'), pg_temp.hp('events.update'));
drop policy if exists "customer reads own" on public.design_approvals;
create policy "customer reads own" on public.design_approvals for select to authenticated
  using (status <> 'DRAFT' and exists (select 1 from public.events e where e.id = event_id and e.customer_id = public.current_customer_id()));

-- ───────── Finance ─────────

select pg_temp.staff_policies('invoices', pg_temp.hp('invoices.view'), pg_temp.hp('invoices.create'), pg_temp.hp('invoices.update') || ' or ' || pg_temp.hp('payments.create'), null);
drop policy if exists "customer reads own" on public.invoices;
create policy "customer reads own" on public.invoices for select to authenticated
  using (customer_id = public.current_customer_id() and status <> 'DRAFT');
select pg_temp.staff_policies('invoice_items', pg_temp.hp('invoices.view'), pg_temp.hp('invoices.create') || ' or ' || pg_temp.hp('invoices.update'), pg_temp.hp('invoices.update'), pg_temp.hp('invoices.update'));
drop policy if exists "customer reads own" on public.invoice_items;
create policy "customer reads own" on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.customer_id = public.current_customer_id() and i.status <> 'DRAFT'));
select pg_temp.staff_policies('payments', pg_temp.hp('payments.view'), pg_temp.hp('payments.create'), pg_temp.hp('payments.create'), null);
drop policy if exists "customer reads own" on public.payments;
create policy "customer reads own" on public.payments for select to authenticated
  using (customer_id = public.current_customer_id() and voided_at is null);
select pg_temp.staff_policies('expense_categories', pg_temp.hp('expenses.view'), pg_temp.hp('settings.manage'), pg_temp.hp('settings.manage'), pg_temp.hp('settings.manage'));
select pg_temp.staff_policies('expenses', pg_temp.hp('expenses.view'), pg_temp.hp('expenses.create'), pg_temp.hp('expenses.create'), null);

select pg_temp.staff_policies('documents', pg_temp.hp('documents.view'), pg_temp.hp('documents.manage') || ' or ' || pg_temp.hp('expenses.create'), pg_temp.hp('documents.manage'), pg_temp.hp('documents.manage'));
drop policy if exists "customer reads shared" on public.documents;
create policy "customer reads shared" on public.documents for select to authenticated
  using (shared_with_customer and deleted_at is null and customer_id = public.current_customer_id());

-- ───────── Notifications, analytics, system ─────────

drop policy if exists "recipient reads" on public.notifications;
create policy "recipient reads" on public.notifications for select to authenticated
  using (
    public.is_staff()
    and (user_id = (select auth.uid()) or (user_id is null and (permission is null or public.has_permission(permission))))
  );
drop policy if exists "staff raise" on public.notifications;
create policy "staff raise" on public.notifications for insert to authenticated with check (public.is_staff());

drop policy if exists "own reads" on public.notification_reads;
create policy "own reads" on public.notification_reads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own preferences" on public.notification_preferences;
create policy "own preferences" on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

select pg_temp.staff_policies('analytics_events', pg_temp.hp('reports.view'), null, null, null);
select pg_temp.staff_policies('automation_rules', pg_temp.hp('settings.manage') || ' or ' || pg_temp.hp('reports.view'), null, pg_temp.hp('settings.manage'), null);
select pg_temp.staff_policies('automation_runs', pg_temp.hp('settings.manage') || ' or ' || pg_temp.hp('reports.view'), null, null, null);
select pg_temp.staff_policies('email_outbox', pg_temp.hp('settings.manage'), null, null, null);
select pg_temp.staff_policies('backups', pg_temp.hp('settings.manage'), pg_temp.hp('settings.manage'), pg_temp.hp('settings.manage'), null);
-- counters and rate_limits: no policies — reachable only through SECURITY DEFINER functions.

-- ───────── Realtime: tables whose changes the admin UI listens to ─────────

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['notifications', 'inquiries', 'bookings', 'payments', 'event_tasks']
    loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
