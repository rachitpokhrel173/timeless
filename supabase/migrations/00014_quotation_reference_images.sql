-- Reference & inspiration images attached to a quotation (media rows in the private event-media bucket).
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "reference_media_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;
