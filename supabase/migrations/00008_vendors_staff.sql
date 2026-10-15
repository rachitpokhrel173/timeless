-- 00008_vendors_staff.sql — Vendors, staff, availability and assignments to events
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- Tables
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"email" text,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"daily_rate" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"photo_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
CREATE TABLE "staff_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"role" text,
	"days" numeric(4, 1) DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "staff_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"status" "availability_status" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "vendor_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"service" text NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"due_date" date,
	"status" "vendor_assignment_status" DEFAULT 'REQUESTED' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "vendor_category" DEFAULT 'OTHER' NOT NULL,
	"contact_person" text,
	"phone" text,
	"email" text,
	"address" text,
	"default_cost" integer DEFAULT 0 NOT NULL,
	"rating" integer,
	"payment_info" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);

-- Foreign keys
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_assignee_staff_id_staff_id_fk" FOREIGN KEY ("assignee_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_timeline" ADD CONSTRAINT "event_timeline_responsible_staff_id_staff_id_fk" FOREIGN KEY ("responsible_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplier_id_vendors_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendor_assignments" ADD CONSTRAINT "vendor_assignments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "vendor_assignments" ADD CONSTRAINT "vendor_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;

-- Indexes
CREATE UNIQUE INDEX "staff_assignment_unique" ON "staff_assignments" USING btree ("event_id","staff_id");
CREATE INDEX "staff_assignment_staff_idx" ON "staff_assignments" USING btree ("staff_id");
CREATE UNIQUE INDEX "staff_availability_unique" ON "staff_availability" USING btree ("staff_id","date");
CREATE INDEX "staff_availability_date_idx" ON "staff_availability" USING btree ("date");
CREATE INDEX "vendor_assign_event_idx" ON "vendor_assignments" USING btree ("event_id");
CREATE INDEX "vendor_assign_vendor_idx" ON "vendor_assignments" USING btree ("vendor_id");
CREATE INDEX "vendors_name_idx" ON "vendors" USING btree ("name");
