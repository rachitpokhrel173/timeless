-- 00003_leads_inquiries.sql — Lead sources, campaigns, pipeline stages, leads, inquiries, follow-ups, activity, notes
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- Tables
CREATE TABLE "campaign_sources" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_key" text,
	"utm_campaign" text,
	"budget" integer DEFAULT 0 NOT NULL,
	"spend" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "campaigns_utm_campaign_unique" UNIQUE("utm_campaign")
);
CREATE TABLE "event_types" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image_id" uuid,
	"show_on_home" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL
);
CREATE TABLE "followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"inquiry_id" uuid,
	"customer_id" uuid,
	"due_at" timestamp with time zone NOT NULL,
	"type" "followup_type" DEFAULT 'CALL' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "followup_status" DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"outcome" text,
	"assigned_to" uuid,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"kind" text DEFAULT 'INQUIRY' NOT NULL,
	"lead_id" uuid,
	"customer_id" uuid,
	"status" "inquiry_status" DEFAULT 'NEW' NOT NULL,
	"assigned_to" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text NOT NULL,
	"event_type" text NOT NULL,
	"event_date" date,
	"venue" text,
	"guest_count" text,
	"budget" text,
	"package_id" uuid,
	"preferred_contact" text,
	"services" text[] DEFAULT '{}'::text[] NOT NULL,
	"designs" text[] DEFAULT '{}'::text[] NOT NULL,
	"theme" text,
	"message" text,
	"inspiration_links" text[] DEFAULT '{}'::text[] NOT NULL,
	"attachments" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_key" text DEFAULT 'WEBSITE' NOT NULL,
	"utm" jsonb,
	"referrer" text,
	"landing_page" text,
	"device" text,
	"ip_hash" text,
	"spam" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "inquiries_number_unique" UNIQUE("number")
);
CREATE TABLE "internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" "activity_type" NOT NULL,
	"body" text NOT NULL,
	"metadata" jsonb,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"event_type" text,
	"event_date" date,
	"location" text,
	"guest_count" text,
	"budget" text,
	"source_key" text DEFAULT 'WEBSITE' NOT NULL,
	"campaign_id" uuid,
	"assigned_to" uuid,
	"stage" text DEFAULT 'NEW' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"lost_reason" text,
	"last_contact_at" timestamp with time zone,
	"next_followup_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "leads_number_unique" UNIQUE("number")
);
CREATE TABLE "sales_pipeline_stages" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL
);

-- Foreign keys
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_source_key_campaign_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."campaign_sources"("key") ON DELETE no action ON UPDATE cascade;
ALTER TABLE "followups" ADD CONSTRAINT "followups_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "followups" ADD CONSTRAINT "followups_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "followups" ADD CONSTRAINT "followups_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "followups" ADD CONSTRAINT "followups_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_source_key_campaign_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."campaign_sources"("key") ON DELETE no action ON UPDATE cascade;
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_key_campaign_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."campaign_sources"("key") ON DELETE no action ON UPDATE cascade;
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_sales_pipeline_stages_key_fk" FOREIGN KEY ("stage") REFERENCES "public"."sales_pipeline_stages"("key") ON DELETE no action ON UPDATE cascade;

-- Indexes
CREATE INDEX "followups_due_idx" ON "followups" USING btree ("status","due_at");
CREATE INDEX "followups_lead_idx" ON "followups" USING btree ("lead_id");
CREATE INDEX "followups_assigned_idx" ON "followups" USING btree ("assigned_to");
CREATE INDEX "inquiries_created_idx" ON "inquiries" USING btree ("created_at");
CREATE INDEX "inquiries_status_idx" ON "inquiries" USING btree ("status");
CREATE INDEX "inquiries_lead_idx" ON "inquiries" USING btree ("lead_id");
CREATE INDEX "inquiries_customer_idx" ON "inquiries" USING btree ("customer_id");
CREATE INDEX "internal_notes_entity_idx" ON "internal_notes" USING btree ("entity_type","entity_id");
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" USING btree ("lead_id","created_at");
CREATE INDEX "leads_stage_idx" ON "leads" USING btree ("stage","position");
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");
CREATE INDEX "leads_customer_idx" ON "leads" USING btree ("customer_id");
CREATE INDEX "leads_assigned_idx" ON "leads" USING btree ("assigned_to");
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("phone");

-- Reference data the app relies on (safe to re-run).

insert into public.sales_pipeline_stages (key, name, position, is_won, is_lost, is_closed) values
  ('NEW', 'New', 1, false, false, false),
  ('CONTACTED', 'Contacted', 2, false, false, false),
  ('QUALIFIED', 'Qualified', 3, false, false, false),
  ('QUOTED', 'Quoted', 4, false, false, false),
  ('NEGOTIATION', 'Negotiation', 5, false, false, false),
  ('CONFIRMED', 'Confirmed', 6, true, false, false),
  ('COMPLETED', 'Completed', 7, true, false, true),
  ('LOST', 'Lost', 8, false, true, true)
on conflict (key) do nothing;

insert into public.campaign_sources (key, name, position) values
  ('WEBSITE', 'Website', 1),
  ('FACEBOOK', 'Facebook', 2),
  ('INSTAGRAM', 'Instagram', 3),
  ('TIKTOK', 'TikTok', 4),
  ('GOOGLE', 'Google', 5),
  ('REFERRAL', 'Referral', 6),
  ('WALK_IN', 'Walk-in', 7),
  ('PHONE', 'Phone', 8),
  ('WHATSAPP', 'WhatsApp', 9),
  ('OTHER', 'Other', 10)
on conflict (key) do nothing;

insert into public.event_types (slug, name, show_on_home, position) values
  ('wedding', 'Weddings', true, 1),
  ('engagement', 'Engagements', true, 2),
  ('birthday', 'Birthdays', true, 3),
  ('corporate', 'Corporate Events', true, 4),
  ('baby-shower', 'Baby Showers', true, 5),
  ('mehendi-haldi', 'Mehendi & Haldi', true, 6),
  ('anniversary', 'Anniversaries', true, 7),
  ('private-party', 'Private Parties', true, 8),
  ('reception', 'Reception', false, 9),
  ('pasni', 'Pasni', false, 10),
  ('bratabandha', 'Bratabandha', false, 11),
  ('other', 'Other', false, 12)
on conflict (slug) do nothing;
