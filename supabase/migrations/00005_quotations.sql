-- 00005_quotations.sql — Quotations, line items, versions and the client acceptance record
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- Tables
CREATE TABLE "quotation_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"name" text,
	"message" text,
	"ip_hash" text,
	"user_agent" text,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"details" text,
	"quantity" numeric(10, 2) DEFAULT 1 NOT NULL,
	"unit" text,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"inventory_item_id" uuid
);
CREATE TABLE "quotation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"lead_id" uuid,
	"inquiry_id" uuid,
	"package_id" uuid,
	"coupon_id" uuid,
	"title" text NOT NULL,
	"event_type" text,
	"event_date" date,
	"venue" text,
	"guest_count" integer,
	"status" "quotation_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"issue_date" date DEFAULT now() NOT NULL,
	"valid_until" date,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"discount_type" text DEFAULT 'FIXED' NOT NULL,
	"discount_value" numeric(12, 2) DEFAULT 0 NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"deposit_percent" numeric(5, 2) DEFAULT 0 NOT NULL,
	"deposit_amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"terms_version" text,
	"public_token" text NOT NULL,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_name" text,
	"accepted_ip_hash" text,
	"client_message" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "quotations_number_unique" UNIQUE("number"),
	CONSTRAINT "quotations_public_token_unique" UNIQUE("public_token")
);

-- Foreign keys
ALTER TABLE "quotation_activity" ADD CONSTRAINT "quotation_activity_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;

-- Indexes
CREATE INDEX "quotation_activity_q_idx" ON "quotation_activity" USING btree ("quotation_id");
CREATE INDEX "quotation_items_q_idx" ON "quotation_items" USING btree ("quotation_id");
CREATE UNIQUE INDEX "quotation_versions_unique" ON "quotation_versions" USING btree ("quotation_id","version");
CREATE INDEX "quotations_customer_idx" ON "quotations" USING btree ("customer_id");
CREATE INDEX "quotations_status_idx" ON "quotations" USING btree ("status");
CREATE INDEX "quotations_created_idx" ON "quotations" USING btree ("created_at");
CREATE INDEX "quotations_lead_idx" ON "quotations" USING btree ("lead_id");
