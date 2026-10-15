-- 00009_finance.sql — Invoices, payments, expenses and documents
-- Applied in order by `supabase db push` (production) or `npm run db:migrate` (local).

-- Tables
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "document_kind" DEFAULT 'OTHER' NOT NULL,
	"title" text NOT NULL,
	"bucket" text DEFAULT 'private-documents' NOT NULL,
	"path" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"customer_id" uuid,
	"event_id" uuid,
	"booking_id" uuid,
	"quotation_id" uuid,
	"invoice_id" uuid,
	"shared_with_customer" boolean DEFAULT false NOT NULL,
	"uploaded_by_customer" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "expense_categories_slug_unique" UNIQUE("slug")
);
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"date" date NOT NULL,
	"vendor_id" uuid,
	"vendor_assignment_id" uuid,
	"event_id" uuid,
	"campaign_id" uuid,
	"method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"receipt_path" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone
);
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT 1 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"booking_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"issue_date" date DEFAULT now() NOT NULL,
	"due_date" date,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"booking_id" uuid NOT NULL,
	"invoice_id" uuid,
	"customer_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_at" date NOT NULL,
	"reference" text,
	"notes" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	CONSTRAINT "payments_number_unique" UNIQUE("number")
);

-- Foreign keys
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "documents" ADD CONSTRAINT "documents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "documents" ADD CONSTRAINT "documents_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "documents" ADD CONSTRAINT "documents_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "documents" ADD CONSTRAINT "documents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_assignment_id_vendor_assignments_id_fk" FOREIGN KEY ("vendor_assignment_id") REFERENCES "public"."vendor_assignments"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;

-- Indexes
CREATE UNIQUE INDEX "documents_bucket_path_key" ON "documents" USING btree ("bucket","path");
CREATE INDEX "documents_customer_idx" ON "documents" USING btree ("customer_id");
CREATE INDEX "documents_event_idx" ON "documents" USING btree ("event_id");
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");
CREATE INDEX "expenses_event_idx" ON "expenses" USING btree ("event_id");
CREATE INDEX "expenses_va_idx" ON "expenses" USING btree ("vendor_assignment_id");
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_id");
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");
CREATE INDEX "invoices_booking_idx" ON "invoices" USING btree ("booking_id");
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status","due_date");
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");
CREATE INDEX "payments_paid_idx" ON "payments" USING btree ("paid_at");

alter table public.payments add constraint payments_amount_positive check (amount > 0);
alter table public.expenses add constraint expenses_amount_positive check (amount > 0);
alter table public.invoices add constraint invoices_amounts_check check (total >= 0 and amount_paid >= 0);
alter table public.bookings add constraint bookings_amounts_check check (total_amount >= 0 and deposit_amount >= 0 and deposit_amount <= total_amount);

-- ─────────────────────────────────────────────────────────────
-- Payments keep invoice and booking balances correct inside the same transaction.
-- ─────────────────────────────────────────────────────────────

create or replace function public.refresh_invoice_balance(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid integer;
begin
  if p_invoice_id is null then
    return;
  end if;
  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = p_invoice_id and voided_at is null;

  update public.invoices i
  set amount_paid = v_paid,
      status = case
        when i.status in ('DRAFT', 'CANCELLED') then i.status
        when v_paid >= i.total then 'PAID'::public.invoice_status
        when i.due_date is not null and i.due_date < current_date then 'OVERDUE'::public.invoice_status
        when v_paid > 0 then 'PARTIALLY_PAID'::public.invoice_status
        else 'SENT'::public.invoice_status
      end
  where i.id = p_invoice_id;
end;
$$;

create or replace function public.refresh_booking_paid(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_booking_id is null then
    return;
  end if;
  update public.bookings b
  set amount_paid = coalesce((select sum(amount) from public.payments p where p.booking_id = b.id and p.voided_at is null), 0)
  where b.id = p_booking_id;
end;
$$;

create or replace function public.payments_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_invoice_balance(new.invoice_id);
    perform public.refresh_booking_paid(new.booking_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    if tg_op = 'DELETE' or old.invoice_id is distinct from new.invoice_id then
      perform public.refresh_invoice_balance(old.invoice_id);
    end if;
    if tg_op = 'DELETE' or old.booking_id is distinct from new.booking_id then
      perform public.refresh_booking_paid(old.booking_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists payments_balance on public.payments;
create trigger payments_balance
  after insert or update or delete on public.payments
  for each row execute function public.payments_after_change();

-- Re-evaluate status when an invoice's total or due date changes.
create or replace function public.invoices_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.total is distinct from new.total or old.due_date is distinct from new.due_date or old.status is distinct from new.status then
    perform public.refresh_invoice_balance(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists invoices_balance on public.invoices;
create trigger invoices_balance
  after insert or update of total, due_date, status on public.invoices
  for each row when (pg_trigger_depth() < 1)
  execute function public.invoices_after_change();

revoke all on function public.refresh_invoice_balance(uuid) from public, anon, authenticated;
revoke all on function public.refresh_booking_paid(uuid) from public, anon, authenticated;
revoke all on function public.payments_after_change() from public, anon, authenticated;
revoke all on function public.invoices_after_change() from public, anon, authenticated;

insert into public.expense_categories (slug, name, position) values
  ('flowers', 'Flowers', 1),
  ('transport', 'Transport', 2),
  ('staff', 'Staff', 3),
  ('vendor', 'Vendor', 4),
  ('equipment', 'Equipment', 5),
  ('marketing', 'Marketing', 6),
  ('rent', 'Rent', 7),
  ('utilities', 'Utilities', 8),
  ('other', 'Other', 9)
on conflict (slug) do nothing;
