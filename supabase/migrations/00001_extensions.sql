-- 00001_extensions.sql — Extensions, enum types and shared helpers
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- Extensions and shared helpers used by every later migration.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Keeps updated_at current on every table that has one (triggers are attached in 00013).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Enum types
CREATE TYPE "public"."activity_type" AS ENUM('NOTE', 'CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'STAGE_CHANGE', 'QUOTATION', 'BOOKING', 'SYSTEM');
CREATE TYPE "public"."availability_status" AS ENUM('AVAILABLE', 'UNAVAILABLE', 'LEAVE');
CREATE TYPE "public"."booking_status" AS ENUM('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "public"."content_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "public"."design_status" AS ENUM('DRAFT', 'SENT', 'VIEWED', 'APPROVED', 'REVISION_REQUESTED');
CREATE TYPE "public"."document_kind" AS ENUM('QUOTATION', 'CONTRACT', 'INVOICE', 'RECEIPT', 'EVENT_BRIEF', 'DESIGN', 'CLIENT_UPLOAD', 'EXPENSE_RECEIPT', 'OTHER');
CREATE TYPE "public"."event_status" AS ENUM('PLANNING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "public"."followup_status" AS ENUM('PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED');
CREATE TYPE "public"."followup_type" AS ENUM('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'OTHER');
CREATE TYPE "public"."inquiry_status" AS ENUM('NEW', 'CONTACTED', 'QUOTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');
CREATE TYPE "public"."maintenance_status" AS ENUM('OPEN', 'IN_PROGRESS', 'DONE');
CREATE TYPE "public"."movement_type" AS ENUM('STOCK_IN', 'STOCK_OUT', 'RESERVATION', 'RELEASE', 'CHECK_OUT', 'RETURN', 'USAGE', 'DAMAGE', 'REPAIRED', 'LOSS', 'MAINTENANCE_IN', 'MAINTENANCE_OUT', 'ADJUSTMENT');
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'BANK_TRANSFER', 'CARD', 'ONLINE', 'CHEQUE', 'OTHER');
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "public"."quotation_status" AS ENUM('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED');
CREATE TYPE "public"."reservation_status" AS ENUM('RESERVED', 'CHECKED_OUT', 'RETURNED', 'RELEASED');
CREATE TYPE "public"."task_status" AS ENUM('TODO', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');
CREATE TYPE "public"."vendor_assignment_status" AS ENUM('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "public"."vendor_category" AS ENUM('FLORIST', 'PHOTOGRAPHER', 'CATERER', 'LIGHTING', 'SOUND', 'TRANSPORT', 'PRINTING', 'FURNITURE', 'OTHER');
