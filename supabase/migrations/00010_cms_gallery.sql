-- 00010_cms_gallery.sql — Website content, gallery, media library and storage buckets
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- Tables
CREATE TABLE "catalogue_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"section_id" uuid NOT NULL,
	"title" text NOT NULL,
	"image_id" uuid,
	"price_amount" integer,
	"price_unit" text,
	"price_from" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'PUBLISHED' NOT NULL,
	CONSTRAINT "catalogue_items_key_unique" UNIQUE("key")
);
CREATE TABLE "catalogue_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'PUBLISHED' NOT NULL,
	CONSTRAINT "catalogue_sections_slug_unique" UNIQUE("slug")
);
CREATE TABLE "gallery_albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"event_type" text,
	"description" text,
	"location" text,
	"event_date" date,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"cover_id" uuid,
	"before_id" uuid,
	"after_id" uuid,
	"event_id" uuid,
	"featured" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'PUBLISHED' NOT NULL,
	"placeholder" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gallery_albums_slug_unique" UNIQUE("slug")
);
CREATE TABLE "gallery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"kind" text DEFAULT 'IMAGE' NOT NULL,
	"title" text,
	"caption" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'PUBLISHED' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "homepage_sections" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "content_status" DEFAULT 'PUBLISHED' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text DEFAULT 'public-media' NOT NULL,
	"path" text NOT NULL,
	"url" text,
	"filename" text NOT NULL,
	"title" text,
	"alt" text DEFAULT '' NOT NULL,
	"mime" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"folder" text DEFAULT 'General' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'PUBLISHED' NOT NULL,
	CONSTRAINT "price_lists_slug_unique" UNIQUE("slug")
);
CREATE TABLE "seo_settings" (
	"path" text PRIMARY KEY NOT NULL,
	"title" text,
	"description" text,
	"og_image_id" uuid,
	"noindex" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "service_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"image_id" uuid,
	"event_type" text,
	"featured" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'PUBLISHED' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug")
);
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
CREATE TABLE "social_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"label" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"handle" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "social_links_platform_unique" UNIQUE("platform")
);
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_name" text NOT NULL,
	"event_type" text NOT NULL,
	"quote" text NOT NULL,
	"rating" integer,
	"photo_id" uuid,
	"date" date,
	"customer_id" uuid,
	"event_id" uuid,
	"consent" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'DRAFT' NOT NULL,
	"placeholder" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Foreign keys
ALTER TABLE "catalogue_items" ADD CONSTRAINT "catalogue_items_section_id_catalogue_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."catalogue_sections"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "catalogue_items" ADD CONSTRAINT "catalogue_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "gallery_albums" ADD CONSTRAINT "gallery_albums_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "gallery_albums" ADD CONSTRAINT "gallery_albums_before_id_media_id_fk" FOREIGN KEY ("before_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "gallery_albums" ADD CONSTRAINT "gallery_albums_after_id_media_id_fk" FOREIGN KEY ("after_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "gallery_albums" ADD CONSTRAINT "gallery_albums_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_album_id_gallery_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."gallery_albums"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "homepage_sections" ADD CONSTRAINT "homepage_sections_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "packages" ADD CONSTRAINT "packages_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "seo_settings" ADD CONSTRAINT "seo_settings_og_image_id_media_id_fk" FOREIGN KEY ("og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "services" ADD CONSTRAINT "services_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "staff" ADD CONSTRAINT "staff_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;

-- Indexes
CREATE INDEX "catalogue_items_section_idx" ON "catalogue_items" USING btree ("section_id","position");
CREATE INDEX "albums_position_idx" ON "gallery_albums" USING btree ("status","position");
CREATE INDEX "gallery_items_album_idx" ON "gallery_items" USING btree ("album_id","position");
CREATE UNIQUE INDEX "media_bucket_path_key" ON "media" USING btree ("bucket","path");
CREATE INDEX "media_folder_idx" ON "media" USING btree ("folder");
CREATE INDEX "media_created_idx" ON "media" USING btree ("created_at");
CREATE INDEX "service_items_service_idx" ON "service_items" USING btree ("service_id");

-- ─────────────────────────────────────────────────────────────
-- Storage buckets
--   public-media       website images (served by public URL; listing is staff-only)
--   avatars            profile photos (public URL; users manage their own folder)
--   event-media        event photos and design files (private; staff + the event's customer)
--   private-documents  quotations, invoices, contracts, receipts, inquiry attachments (private)
-- Private files are only ever handed out as short-lived signed URLs.
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public-media', 'public-media', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('event-media', 'event-media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'application/pdf']),
  ('private-documents', 'private-documents', false, 15728640, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- public-media: anyone can fetch by URL (public bucket); only website editors can list or change files.
drop policy if exists "public-media: staff list" on storage.objects;
create policy "public-media: staff list" on storage.objects for select to authenticated
  using (bucket_id = 'public-media' and public.is_staff());
drop policy if exists "public-media: editors write" on storage.objects;
create policy "public-media: editors write" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and (public.has_permission('cms.manage') or public.has_permission('inventory.update') or public.has_permission('staff.manage')));
drop policy if exists "public-media: editors update" on storage.objects;
create policy "public-media: editors update" on storage.objects for update to authenticated
  using (bucket_id = 'public-media' and public.has_permission('cms.manage'));
drop policy if exists "public-media: editors delete" on storage.objects;
create policy "public-media: editors delete" on storage.objects for delete to authenticated
  using (bucket_id = 'public-media' and public.has_permission('cms.manage'));

-- avatars: each user manages files under avatars/<their user id>/
drop policy if exists "avatars: own folder" on storage.objects;
create policy "avatars: own folder" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- event-media: files live under events/<event id>/…
drop policy if exists "event-media: staff read" on storage.objects;
create policy "event-media: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'event-media' and (public.has_permission('events.view') or public.has_permission('cms.manage')));
drop policy if exists "event-media: customer read own event" on storage.objects;
create policy "event-media: customer read own event" on storage.objects for select to authenticated
  using (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1] = 'events'
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(name))[2] and e.customer_id = public.current_customer_id()
    )
  );
drop policy if exists "event-media: planners write" on storage.objects;
create policy "event-media: planners write" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-media' and public.has_permission('events.update'));
drop policy if exists "event-media: planners delete" on storage.objects;
create policy "event-media: planners delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-media' and public.has_permission('events.update'));

-- private-documents: staff with document access; customers only files explicitly shared with them.
drop policy if exists "private-documents: staff read" on storage.objects;
create policy "private-documents: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'private-documents' and public.has_permission('documents.view'));
drop policy if exists "private-documents: customer read shared" on storage.objects;
create policy "private-documents: customer read shared" on storage.objects for select to authenticated
  using (
    bucket_id = 'private-documents'
    and exists (
      select 1 from public.documents d
      where d.bucket = 'private-documents' and d.path = name and d.shared_with_customer
        and d.deleted_at is null and d.customer_id = public.current_customer_id()
    )
  );
drop policy if exists "private-documents: staff write" on storage.objects;
create policy "private-documents: staff write" on storage.objects for insert to authenticated
  with check (bucket_id = 'private-documents' and (public.has_permission('documents.manage') or public.has_permission('expenses.create')));
drop policy if exists "private-documents: staff delete" on storage.objects;
create policy "private-documents: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'private-documents' and public.has_permission('documents.manage'));
