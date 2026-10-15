-- 00004_customers.sql — Customers and their contacts
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- Tables
CREATE TABLE "customer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relation" text,
	"phone" text,
	"email" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"alt_phone" text,
	"address" text,
	"source_key" text,
	"auth_user_id" uuid,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "customers_auth_user_id_unique" UNIQUE("auth_user_id")
);

-- Foreign keys
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "customers" ADD CONSTRAINT "customers_source_key_campaign_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."campaign_sources"("key") ON DELETE no action ON UPDATE cascade;
ALTER TABLE "customers" ADD CONSTRAINT "customers_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "followups" ADD CONSTRAINT "followups_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;

-- Indexes
CREATE INDEX "customer_contacts_customer_idx" ON "customer_contacts" USING btree ("customer_id");
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");
CREATE INDEX "customers_email_idx" ON "customers" USING btree (lower("email"));

-- The customer record linked to the signed-in client-portal user (null for staff).
create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.customers c
  where c.auth_user_id = (select auth.uid()) and c.deleted_at is null
  limit 1;
$$;

revoke all on function public.current_customer_id() from public;
grant execute on function public.current_customer_id() to anon, authenticated, service_role;

-- Fast phone/name lookup for de-duplicating customers and global search.
create index if not exists customers_name_trgm_idx on public.customers using gin (name extensions.gin_trgm_ops);
create index if not exists leads_name_trgm_idx on public.leads using gin (name extensions.gin_trgm_ops);
