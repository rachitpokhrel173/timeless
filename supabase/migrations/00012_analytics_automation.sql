-- 00012_analytics_automation.sql — Analytics events, coupons, automations, backups, counters and rate limits
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- Tables
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"path" text,
	"session_id" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"referrer" text,
	"device" text,
	"entity_type" text,
	"entity_id" text,
	"properties" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "automation_rules" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_key" text NOT NULL,
	"summary" text NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"path" text,
	"size" integer,
	"table_counts" jsonb,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"value" integer NOT NULL,
	"min_amount" integer DEFAULT 0 NOT NULL,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);

-- Foreign keys
ALTER TABLE "backups" ADD CONSTRAINT "backups_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;

-- Indexes
CREATE INDEX "analytics_name_created_idx" ON "analytics_events" USING btree ("name","created_at");
CREATE INDEX "analytics_created_idx" ON "analytics_events" USING btree ("created_at");
CREATE INDEX "automation_runs_created_idx" ON "automation_runs" USING btree ("created_at");

-- ─────────────────────────────────────────────────────────────
-- Sequential document numbers: QT-2026-001, BK-2026-014, INV-…, RC-…, LD-…, IQ-…
-- The counter starts from the highest number already used, so numbering survives imports.
-- ─────────────────────────────────────────────────────────────

create or replace function public.next_document_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_key text := p_prefix || '-' || extract(year from now())::int;
  v_start int;
  v_value int;
begin
  v_table := case p_prefix
    when 'QT' then 'quotations'
    when 'BK' then 'bookings'
    when 'INV' then 'invoices'
    when 'RC' then 'payments'
    when 'LD' then 'leads'
    when 'IQ' then 'inquiries'
    else null
  end;
  if v_table is null then
    raise exception 'Unknown document prefix %', p_prefix;
  end if;
  -- Staff, or the server's privileged connection (auth.uid() is null there)
  if (select auth.uid()) is not null and not public.is_staff() then
    raise exception 'Not allowed';
  end if;

  execute format(
    'select coalesce(max((substring(number from ''[0-9]+$''))::int), 0) from public.%I where number like $1',
    v_table
  ) into v_start using v_key || '-%';

  insert into public.counters (key, value) values (v_key, v_start + 1)
  on conflict (key) do update set value = greatest(public.counters.value, v_start) + 1
  returning value into v_value;

  return v_key || '-' || lpad(v_value::text, 3, '0');
end;
$$;

revoke all on function public.next_document_number(text) from public, anon;
grant execute on function public.next_document_number(text) to authenticated, service_role;

-- Fixed-window rate limiter (used by the server for login and public forms). Returns true when allowed.
create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    count = case when public.rate_limits.reset_at < now() then 1 else public.rate_limits.count + 1 end,
    reset_at = case when public.rate_limits.reset_at < now() then now() + make_interval(secs => p_window_seconds) else public.rate_limits.reset_at end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

-- Built-in automation rules and checklist templates (switched on/off under System → Automations)

insert into public.automation_rules (key, name, trigger, description, config) values
  ('inquiry.created', 'New website inquiry', 'When a visitor submits the inquiry form', 'Create a lead (and link or create the client), notify the sales team, and email the visitor a confirmation if they gave an email.', '{"sendConfirmation":true}'::jsonb),
  ('quote.accepted', 'Quotation accepted', 'When a client accepts a quotation online', 'Create a pending booking with its event workspace from the quotation, mark the lead as won and notify the team.', '{"createBooking":true}'::jsonb),
  ('quote.expiring', 'Quotation expiring', 'Daily — quotations close to their valid-until date', 'Warn the team a few days before a sent quotation expires, and mark it expired once the date has passed.', '{"daysBefore":3}'::jsonb),
  ('payment.overdue', 'Payment overdue', 'Daily — bookings past their balance or deposit due date', 'Raise a notification for every booking with money still owed after its due date.', '{}'::jsonb),
  ('event.upcoming', 'Upcoming event reminder', 'Daily — events coming up soon', 'Remind the team (and optionally email the client) a set number of days before each event.', '{"daysBefore":7,"emailClient":false}'::jsonb),
  ('inventory.low', 'Low stock alert', 'Whenever stock changes, and daily', 'Alert the inventory team when an item''s available quantity falls below its minimum.', '{}'::jsonb),
  ('task.overdue', 'Task overdue', 'Daily — tasks past their due date', 'Notify the team about tasks that are past due and not done.', '{}'::jsonb),
  ('followup.due', 'Follow-up reminder', 'Daily — follow-ups due today', 'Remind the assigned person about today''s follow-ups (and email them if email is set up).', '{"email":false}'::jsonb),
  ('vendor.payment_due', 'Vendor payment due', 'Daily — vendor bookings past their due date', 'Flag vendor bookings that are due and not fully paid.', '{}'::jsonb),
  ('staff.conflict', 'Staff double-booking', 'When someone is assigned to an event', 'Warn when a team member is assigned to events whose setup windows overlap.', '{}'::jsonb)
on conflict (key) do nothing;

insert into public.checklist_templates (name, phase, items)
select v.name, v.phase, v.items from (values
  ('Standard pre-event', 'PRE', array['Confirm venue access and setup time', 'Confirm client requirements and final design', 'Prepare flowers', 'Prepare backdrop', 'Check lighting', 'Load vehicle', 'Confirm staff', 'Confirm vendors']::text[]),
  ('Standard post-event', 'POST', array['Dismantle décor', 'Return rental items', 'Inventory check', 'Damage inspection', 'Client follow-up', 'Upload photos']::text[])
) as v(name, phase, items)
where not exists (select 1 from public.checklist_templates t where t.name = v.name);
