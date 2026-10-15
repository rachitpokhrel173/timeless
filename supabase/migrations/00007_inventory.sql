-- 00007_inventory.sql — Inventory, packages, reservations and stock movements
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- Tables
CREATE TABLE "inventory_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_categories_slug_unique" UNIQUE("slug")
);
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"description" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"damaged" integer DEFAULT 0 NOT NULL,
	"in_maintenance" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"consumable" boolean DEFAULT false NOT NULL,
	"purchase_cost" integer DEFAULT 0 NOT NULL,
	"replacement_cost" integer DEFAULT 0 NOT NULL,
	"rental_price" integer DEFAULT 0 NOT NULL,
	"supplier_id" uuid,
	"location" text,
	"image_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "inventory_items_sku_unique" UNIQUE("sku")
);
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"type" "movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"event_id" uuid,
	"reference" text,
	"notes" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "inventory_reservation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'RESERVED' NOT NULL,
	"returned_damaged" integer DEFAULT 0 NOT NULL,
	"returned_lost" integer DEFAULT 0 NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"booking_id" uuid,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservations_event_id_unique" UNIQUE("event_id")
);
CREATE TABLE "maintenance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"issue" text NOT NULL,
	"status" "maintenance_status" DEFAULT 'OPEN' NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"vendor_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "package_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"inventory_item_id" uuid,
	"label" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tier" text,
	"summary" text,
	"description" text,
	"price" integer DEFAULT 0 NOT NULL,
	"price_from" boolean DEFAULT true NOT NULL,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"image_id" uuid,
	"event_type" text,
	"status" "content_status" DEFAULT 'PUBLISHED' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_slug_unique" UNIQUE("slug")
);

-- Foreign keys
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_id_inventory_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_categories"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inventory_reservation_items" ADD CONSTRAINT "inventory_reservation_items_reservation_id_inventory_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_reservation_items" ADD CONSTRAINT "inventory_reservation_items_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;

-- Indexes
CREATE INDEX "inventory_name_idx" ON "inventory_items" USING btree ("name");
CREATE INDEX "inventory_category_idx" ON "inventory_items" USING btree ("category_id");
CREATE INDEX "movements_item_idx" ON "inventory_movements" USING btree ("item_id","created_at");
CREATE INDEX "movements_created_idx" ON "inventory_movements" USING btree ("created_at");
CREATE UNIQUE INDEX "reservation_item_unique" ON "inventory_reservation_items" USING btree ("reservation_id","item_id");
CREATE INDEX "reservation_items_item_idx" ON "inventory_reservation_items" USING btree ("item_id","status");
CREATE INDEX "reservations_booking_idx" ON "inventory_reservations" USING btree ("booking_id");
CREATE INDEX "maintenance_item_idx" ON "maintenance_records" USING btree ("item_id");
CREATE INDEX "package_items_pkg_idx" ON "package_items" USING btree ("package_id");

alter table public.inventory_items
  add constraint inventory_items_quantities_check
  check (quantity >= 0 and damaged >= 0 and in_maintenance >= 0 and damaged + in_maintenance <= quantity);

alter table public.inventory_reservation_items
  add constraint reservation_items_quantity_check
  check (quantity >= 0 and returned_damaged >= 0 and returned_lost >= 0 and used >= 0 and returned_damaged + returned_lost + used <= quantity);

insert into public.inventory_categories (slug, name, position) values
  ('backdrops', 'Backdrops', 1),
  ('flowers', 'Flowers', 2),
  ('arches', 'Arches', 3),
  ('tables', 'Tables', 4),
  ('chairs', 'Chairs', 5),
  ('lighting', 'Lighting', 6),
  ('candles', 'Candles', 7),
  ('stands', 'Stands', 8),
  ('fabrics', 'Fabrics & Drapes', 9),
  ('props', 'Props', 10),
  ('centerpieces', 'Centerpieces', 11),
  ('signage', 'Signage', 12),
  ('other', 'Other', 13)
on conflict (slug) do nothing;
