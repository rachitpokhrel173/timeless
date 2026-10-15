-- 00006_bookings_events.sql — Bookings, booked items, events, tasks, checklists, timeline, notes, design approvals
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- Tables
CREATE TABLE "booking_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT 1 NOT NULL,
	"unit" text,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"inventory_item_id" uuid
);
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"quotation_id" uuid,
	"package_id" uuid,
	"lead_id" uuid,
	"inquiry_id" uuid,
	"status" "booking_status" DEFAULT 'PENDING' NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"deposit_amount" integer DEFAULT 0 NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"deposit_due_date" date,
	"balance_due_date" date,
	"source_key" text,
	"campaign_id" uuid,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "bookings_number_unique" UNIQUE("number"),
	CONSTRAINT "bookings_quotation_id_unique" UNIQUE("quotation_id")
);
CREATE TABLE "checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phase" text NOT NULL,
	"items" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "design_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"media_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "design_status" DEFAULT 'DRAFT' NOT NULL,
	"client_response" text,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "event_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"body" text NOT NULL,
	"visibility" text DEFAULT 'INTERNAL' NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "event_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"checklist" text,
	"assignee_staff_id" uuid,
	"assignee_user_id" uuid,
	"due_at" timestamp with time zone,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "task_status" DEFAULT 'TODO' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "event_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"responsible_staff_id" uuid,
	"status" "task_status" DEFAULT 'TODO' NOT NULL,
	"notes" text
);
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"customer_id" uuid,
	"title" text NOT NULL,
	"event_type" text,
	"event_date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"venue" text,
	"venue_address" text,
	"guest_count" integer,
	"status" "event_status" DEFAULT 'PLANNING' NOT NULL,
	"requirements" text,
	"color_theme" text,
	"estimated_cost" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "events_booking_id_unique" UNIQUE("booking_id")
);

-- Foreign keys
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_source_key_campaign_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."campaign_sources"("key") ON DELETE no action ON UPDATE cascade;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "design_approvals" ADD CONSTRAINT "design_approvals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "design_approvals" ADD CONSTRAINT "design_approvals_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_notes" ADD CONSTRAINT "event_notes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_notes" ADD CONSTRAINT "event_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_assignee_user_id_profiles_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_timeline" ADD CONSTRAINT "event_timeline_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "events" ADD CONSTRAINT "events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "events" ADD CONSTRAINT "events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;

-- Indexes
CREATE INDEX "booking_items_booking_idx" ON "booking_items" USING btree ("booking_id");
CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("customer_id");
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");
CREATE INDEX "bookings_created_idx" ON "bookings" USING btree ("created_at");
CREATE INDEX "designs_event_idx" ON "design_approvals" USING btree ("event_id");
CREATE INDEX "event_notes_event_idx" ON "event_notes" USING btree ("event_id");
CREATE INDEX "tasks_event_idx" ON "event_tasks" USING btree ("event_id");
CREATE INDEX "tasks_staff_idx" ON "event_tasks" USING btree ("assignee_staff_id");
CREATE INDEX "tasks_user_idx" ON "event_tasks" USING btree ("assignee_user_id");
CREATE INDEX "tasks_due_idx" ON "event_tasks" USING btree ("status","due_at");
CREATE INDEX "timeline_event_idx" ON "event_timeline" USING btree ("event_id","starts_at");
CREATE INDEX "events_date_idx" ON "events" USING btree ("event_date");
CREATE INDEX "events_window_idx" ON "events" USING btree ("start_at","end_at");
CREATE INDEX "events_customer_idx" ON "events" USING btree ("customer_id");
