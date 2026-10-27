/*
 * Database schema (TypeScript mirror of supabase/migrations — keep the two in sync; the
 * `npm run db:check` script fails when they drift).
 *
 * Conventions
 * - Money is whole Nepali rupees (integer). Percentages are numeric(5,2).
 * - Business records are archived (`archived_at`) or soft-deleted (`deleted_at`); financial rows
 *   are voided/cancelled, never deleted.
 * - Event days are `date`; moments are `timestamptz`.
 * - Users live in Supabase Auth (auth.users); `profiles` holds their app data.
 *
 * Core flow: inquiry → lead → customer → quotation → booking (+ event) → invoice → payment →
 * completion → gallery / testimonial.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
/** Kept current by the set_updated_at() trigger in the migrations. */
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => integer(name).notNull().default(0);
const percent = (name: string) => numeric(name, { precision: 5, scale: 2, mode: "number" }).notNull().default(0);
const qty = (name: string) => numeric(name, { precision: 10, scale: 2, mode: "number" }).notNull().default(1);
const textArray = (name: string) => text(name).array().notNull().default(sql`'{}'::text[]`);

/** Supabase Auth's users table (managed by Supabase — referenced, never migrated here). */
const auth = pgSchema("auth");
export const authUsers = auth.table("users", { id: uuid("id").primaryKey(), email: text("email") });

/* ───────────────────────────── Enums ───────────────────────────── */

export const priority = pgEnum("priority", ["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const contentStatus = pgEnum("content_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const inquiryStatus = pgEnum("inquiry_status", ["NEW", "CONTACTED", "QUOTED", "CONFIRMED", "COMPLETED", "CANCELLED"]);
export const followupStatus = pgEnum("followup_status", ["PENDING", "COMPLETED", "OVERDUE", "CANCELLED"]);
export const followupType = pgEnum("followup_type", ["CALL", "WHATSAPP", "EMAIL", "MEETING", "OTHER"]);
export const activityType = pgEnum("activity_type", ["NOTE", "CALL", "WHATSAPP", "EMAIL", "MEETING", "STAGE_CHANGE", "QUOTATION", "BOOKING", "SYSTEM"]);
export const quotationStatus = pgEnum("quotation_status", ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED"]);
export const bookingStatus = pgEnum("booking_status", ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
export const eventStatus = pgEnum("event_status", ["PLANNING", "READY", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
export const taskStatus = pgEnum("task_status", ["TODO", "IN_PROGRESS", "COMPLETED", "BLOCKED"]);
export const paymentMethod = pgEnum("payment_method", ["CASH", "BANK_TRANSFER", "CARD", "ONLINE", "CHEQUE", "OTHER"]);
export const invoiceStatus = pgEnum("invoice_status", ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"]);
export const movementType = pgEnum("movement_type", [
  "STOCK_IN",
  "STOCK_OUT",
  "RESERVATION",
  "RELEASE",
  "CHECK_OUT",
  "RETURN",
  "USAGE",
  "DAMAGE",
  "REPAIRED",
  "LOSS",
  "MAINTENANCE_IN",
  "MAINTENANCE_OUT",
  "ADJUSTMENT",
]);
export const reservationStatus = pgEnum("reservation_status", ["RESERVED", "CHECKED_OUT", "RETURNED", "RELEASED"]);
export const maintenanceStatus = pgEnum("maintenance_status", ["OPEN", "IN_PROGRESS", "DONE"]);
export const vendorCategory = pgEnum("vendor_category", ["FLORIST", "PHOTOGRAPHER", "CATERER", "LIGHTING", "SOUND", "TRANSPORT", "PRINTING", "FURNITURE", "OTHER"]);
export const vendorAssignmentStatus = pgEnum("vendor_assignment_status", ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"]);
export const availabilityStatus = pgEnum("availability_status", ["AVAILABLE", "UNAVAILABLE", "LEAVE"]);
export const documentKind = pgEnum("document_kind", ["QUOTATION", "CONTRACT", "INVOICE", "RECEIPT", "EVENT_BRIEF", "DESIGN", "CLIENT_UPLOAD", "EXPENSE_RECEIPT", "OTHER"]);
export const designStatus = pgEnum("design_status", ["DRAFT", "SENT", "VIEWED", "APPROVED", "REVISION_REQUESTED"]);

/* ───────────────────────── Auth, RBAC, audit ───────────────────────── */

export type UserPrefs = { theme?: "light" | "dark" | "system"; widgets?: string[]; sidebarCollapsed?: boolean };

export const profiles = pgTable("profiles", {
  /** Same id as auth.users. */
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull().default(""),
  email: text("email").notNull(),
  phone: text("phone"),
  avatarPath: text("avatar_path"),
  staffId: uuid("staff_id").references((): AnyPgColumn => staff.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  prefs: jsonb("prefs").$type<UserPrefs>().notNull().default({}),
  lastSeenAt: ts("last_seen_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const roles = pgTable("roles", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  /** Built-in roles can be edited but not deleted. */
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  groupName: text("group_name").notNull(),
  label: text("label").notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index("user_roles_role_idx").on(t.roleId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    email: text("email").notNull(),
    userId: uuid("user_id"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    success: boolean("success").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_created_idx").on(t.createdAt), index("login_attempts_email_idx").on(t.email, t.createdAt)],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: id(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    /** Snapshot so the log stays readable after the user is removed. */
    userName: text("user_name"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt), index("activity_entity_idx").on(t.entity, t.entityId), index("activity_user_idx").on(t.userId)],
);

/* ───────────────────────────── Media ───────────────────────────── */

export const media = pgTable(
  "media",
  {
    id: id(),
    /** Storage bucket: public-media, event-media, private-documents, avatars — or "static" for files shipped in /public. */
    bucket: text("bucket").notNull().default("public-media"),
    path: text("path").notNull(),
    /** Public URL for public buckets; null for private files (served via signed URLs). */
    url: text("url"),
    filename: text("filename").notNull(),
    title: text("title"),
    alt: text("alt").notNull().default(""),
    mime: text("mime").notNull(),
    size: integer("size").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    folder: text("folder").notNull().default("General"),
    tags: textArray("tags"),
    uploadedBy: uuid("uploaded_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [uniqueIndex("media_bucket_path_key").on(t.bucket, t.path), index("media_folder_idx").on(t.folder), index("media_created_idx").on(t.createdAt)],
);

/* ───────────────────────────── Marketing lookups ───────────────────────────── */

/** Where leads come from (Website, Instagram, Referral…). Editable list; leads reference it. */
export const campaignSources = pgTable("campaign_sources", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
});

export const campaigns = pgTable("campaigns", {
  id: id(),
  name: text("name").notNull(),
  sourceKey: text("source_key").references(() => campaignSources.key, { onUpdate: "cascade" }),
  /** Matches utm_campaign on website inquiries for automatic attribution. */
  utmCampaign: text("utm_campaign").unique(),
  budget: money("budget"),
  spend: money("spend"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  archivedAt: ts("archived_at"),
});

export const coupons = pgTable("coupons", {
  id: id(),
  code: text("code").notNull().unique(),
  description: text("description"),
  type: text("type", { enum: ["PERCENT", "FIXED"] }).notNull(),
  value: integer("value").notNull(),
  minAmount: money("min_amount"),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: date("expires_at"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────────────────────── Customers ───────────────────────────── */

export const customers = pgTable(
  "customers",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    altPhone: text("alt_phone"),
    address: text("address"),
    sourceKey: text("source_key").references(() => campaignSources.key, { onUpdate: "cascade" }),
    /** Client-portal login (Supabase Auth user), when the customer has one. */
    authUserId: uuid("auth_user_id")
      .unique()
      .references(() => authUsers.id, { onDelete: "set null" }),
    tags: textArray("tags"),
    /** Venue photos, inspiration and references (media ids, private event-media bucket). */
    referenceMediaIds: uuid("reference_media_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** Extra services the customer has asked for — Panche Baja, Pasni décor, … */
    requestedServices: textArray("requested_services"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("customers_name_idx").on(t.name),
    index("customers_phone_idx").on(t.phone),
    index("customers_email_idx").on(sql`lower(${t.email})`),
    index("customers_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  ],
);

export const customerContacts = pgTable(
  "customer_contacts",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relation: text("relation"),
    phone: text("phone"),
    email: text("email"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("customer_contacts_customer_idx").on(t.customerId)],
);

/* ───────────────────────────── Leads & inquiries ───────────────────────────── */

export const salesPipelineStages = pgTable("sales_pipeline_stages", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  isWon: boolean("is_won").notNull().default(false),
  isLost: boolean("is_lost").notNull().default(false),
  /** Closed stages (won/completed/lost) leave the active board after a while. */
  isClosed: boolean("is_closed").notNull().default(false),
});

export const leads = pgTable(
  "leads",
  {
    id: id(),
    number: text("number").notNull().unique(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    eventType: text("event_type"),
    eventDate: date("event_date"),
    location: text("location"),
    guestCount: text("guest_count"),
    budget: text("budget"),
    sourceKey: text("source_key")
      .notNull()
      .default("WEBSITE")
      .references(() => campaignSources.key, { onUpdate: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    assignedTo: uuid("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
    stage: text("stage")
      .notNull()
      .default("NEW")
      .references(() => salesPipelineStages.key, { onUpdate: "cascade" }),
    priority: priority("priority").notNull().default("MEDIUM"),
    /** Kanban order within a stage. */
    position: integer("position").notNull().default(0),
    lostReason: text("lost_reason"),
    lastContactAt: ts("last_contact_at"),
    nextFollowupAt: ts("next_followup_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("leads_stage_idx").on(t.stage, t.position),
    index("leads_created_idx").on(t.createdAt),
    index("leads_customer_idx").on(t.customerId),
    index("leads_assigned_idx").on(t.assignedTo),
    index("leads_phone_idx").on(t.phone),
    index("leads_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  ],
);

export const inquiries = pgTable(
  "inquiries",
  {
    id: id(),
    number: text("number").notNull().unique(),
    kind: text("kind", { enum: ["INQUIRY", "BOOKING_REQUEST"] }).notNull().default("INQUIRY"),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    status: inquiryStatus("status").notNull().default("NEW"),
    assignedTo: uuid("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone").notNull(),
    eventType: text("event_type").notNull(),
    eventDate: date("event_date"),
    venue: text("venue"),
    guestCount: text("guest_count"),
    budget: text("budget"),
    packageId: uuid("package_id").references((): AnyPgColumn => packages.id, { onDelete: "set null" }),
    preferredContact: text("preferred_contact"),
    services: textArray("services"),
    designs: textArray("designs"),
    theme: text("theme"),
    message: text("message"),
    inspirationLinks: textArray("inspiration_links"),
    /** Paths in private-documents (inquiries/<id>/…) uploaded with the form. */
    attachments: textArray("attachments"),
    sourceKey: text("source_key")
      .notNull()
      .default("WEBSITE")
      .references(() => campaignSources.key, { onUpdate: "cascade" }),
    utm: jsonb("utm").$type<Record<string, string>>(),
    referrer: text("referrer"),
    landingPage: text("landing_page"),
    device: text("device"),
    /** Salted hash of the IP — enough for rate limiting; the raw IP is never stored. */
    ipHash: text("ip_hash"),
    spam: boolean("spam").notNull().default(false),
    readAt: ts("read_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("inquiries_created_idx").on(t.createdAt), index("inquiries_status_idx").on(t.status), index("inquiries_lead_idx").on(t.leadId), index("inquiries_customer_idx").on(t.customerId)],
);

export const followups = pgTable(
  "followups",
  {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    dueAt: ts("due_at").notNull(),
    type: followupType("type").notNull().default("CALL"),
    priority: priority("priority").notNull().default("MEDIUM"),
    status: followupStatus("status").notNull().default("PENDING"),
    note: text("note"),
    outcome: text("outcome"),
    assignedTo: uuid("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
    completedAt: ts("completed_at"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("followups_due_idx").on(t.status, t.dueAt), index("followups_lead_idx").on(t.leadId), index("followups_assigned_idx").on(t.assignedTo)],
);

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    type: activityType("type").notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("lead_activities_lead_idx").on(t.leadId, t.createdAt)],
);

/** Private team notes on any record. Never shown to customers. */
export const internalNotes = pgTable(
  "internal_notes",
  {
    id: id(),
    entityType: text("entity_type", { enum: ["lead", "inquiry", "customer", "quotation", "booking", "event", "vendor", "staff", "inventory"] }).notNull(),
    entityId: uuid("entity_id").notNull(),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    authorId: uuid("author_id").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("internal_notes_entity_idx").on(t.entityType, t.entityId)],
);

export const eventTypes = pgTable("event_types", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  imageId: uuid("image_id").references(() => media.id, { onDelete: "set null" }),
  showOnHome: boolean("show_on_home").notNull().default(false),
  position: integer("position").notNull().default(0),
  published: boolean("published").notNull().default(true),
});

/* ───────────────────────────── Vendors, staff ───────────────────────────── */

export const vendors = pgTable(
  "vendors",
  {
    id: id(),
    name: text("name").notNull(),
    category: vendorCategory("category").notNull().default("OTHER"),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    /** Typical rate, for quick estimates. */
    defaultCost: money("default_cost"),
    rating: integer("rating"),
    paymentInfo: text("payment_info"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("vendors_name_idx").on(t.name)],
);

export const staff = pgTable("staff", {
  id: id(),
  name: text("name").notNull(),
  role: text("role"),
  phone: text("phone"),
  email: text("email"),
  skills: textArray("skills"),
  /** NPR per event day — used for event profitability. */
  dailyRate: money("daily_rate"),
  active: boolean("active").notNull().default(true),
  photoId: uuid("photo_id").references(() => media.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  archivedAt: ts("archived_at"),
});

export const staffAvailability = pgTable(
  "staff_availability",
  {
    id: id(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    status: availabilityStatus("status").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("staff_availability_unique").on(t.staffId, t.date), index("staff_availability_date_idx").on(t.date)],
);

/* ───────────────────────────── Inventory & packages ───────────────────────────── */

export const inventoryCategories = pgTable("inventory_categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
});

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: id(),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull(),
    categoryId: uuid("category_id").references(() => inventoryCategories.id, { onDelete: "set null" }),
    description: text("description"),
    /** Units owned. Reserved/available are derived from reservations. */
    quantity: integer("quantity").notNull().default(0),
    damaged: integer("damaged").notNull().default(0),
    inMaintenance: integer("in_maintenance").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
    unit: text("unit").notNull().default("pcs"),
    /** Consumables (fresh flowers, candles) are used up at events instead of returned. */
    consumable: boolean("consumable").notNull().default(false),
    purchaseCost: money("purchase_cost"),
    replacementCost: money("replacement_cost"),
    rentalPrice: money("rental_price"),
    supplierId: uuid("supplier_id").references(() => vendors.id, { onDelete: "set null" }),
    location: text("location"),
    imageId: uuid("image_id").references(() => media.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    index("inventory_name_idx").on(t.name),
    index("inventory_category_idx").on(t.categoryId),
    check("inventory_items_quantities_check", sql`${t.quantity} >= 0 and ${t.damaged} >= 0 and ${t.inMaintenance} >= 0 and ${t.damaged} + ${t.inMaintenance} <= ${t.quantity}`),
  ],
);

export const maintenanceRecords = pgTable(
  "maintenance_records",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    issue: text("issue").notNull(),
    status: maintenanceStatus("status").notNull().default("OPEN"),
    cost: money("cost"),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    startedAt: ts("started_at").notNull().defaultNow(),
    completedAt: ts("completed_at"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("maintenance_item_idx").on(t.itemId)],
);

export const packages = pgTable("packages", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tier: text("tier"),
  summary: text("summary"),
  description: text("description"),
  price: money("price"),
  priceFrom: boolean("price_from").notNull().default(true),
  features: textArray("features"),
  imageId: uuid("image_id").references(() => media.id, { onDelete: "set null" }),
  eventType: text("event_type"),
  status: contentStatus("status").notNull().default("PUBLISHED"),
  featured: boolean("featured").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** What a package needs — drives inventory reservation when it's booked. */
export const packageItems = pgTable(
  "package_items",
  {
    id: id(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    quantity: integer("quantity").notNull().default(1),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("package_items_pkg_idx").on(t.packageId)],
);

/* ───────────────────────────── Quotations ───────────────────────────── */

export const quotations = pgTable(
  "quotations",
  {
    id: id(),
    number: text("number").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id, { onDelete: "set null" }),
    packageId: uuid("package_id").references(() => packages.id, { onDelete: "set null" }),
    couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    eventType: text("event_type"),
    eventDate: date("event_date"),
    venue: text("venue"),
    guestCount: integer("guest_count"),
    status: quotationStatus("status").notNull().default("DRAFT"),
    version: integer("version").notNull().default(1),
    issueDate: date("issue_date").notNull().defaultNow(),
    validUntil: date("valid_until"),
    subtotal: money("subtotal"),
    discountType: text("discount_type", { enum: ["PERCENT", "FIXED"] }).notNull().default("FIXED"),
    discountValue: numeric("discount_value", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    discountAmount: money("discount_amount"),
    taxRate: percent("tax_rate"),
    taxAmount: money("tax_amount"),
    total: money("total"),
    depositPercent: percent("deposit_percent"),
    depositAmount: money("deposit_amount"),
    notes: text("notes"),
    terms: text("terms"),
    termsVersion: text("terms_version"),
    /** Reference & inspiration images (media ids, private event-media bucket), shown on the quotation. */
    referenceMediaIds: uuid("reference_media_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** Capability token for the public /quote/<token> page. */
    publicToken: text("public_token").notNull().unique(),
    sentAt: ts("sent_at"),
    viewedAt: ts("viewed_at"),
    respondedAt: ts("responded_at"),
    acceptedAt: ts("accepted_at"),
    acceptedName: text("accepted_name"),
    acceptedIpHash: text("accepted_ip_hash"),
    clientMessage: text("client_message"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("quotations_customer_idx").on(t.customerId), index("quotations_status_idx").on(t.status), index("quotations_created_idx").on(t.createdAt), index("quotations_lead_idx").on(t.leadId)],
);

export const quotationItems = pgTable(
  "quotation_items",
  {
    id: id(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    details: text("details"),
    quantity: qty("quantity"),
    unit: text("unit"),
    unitPrice: money("unit_price"),
    amount: money("amount"),
    inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
  },
  (t) => [index("quotation_items_q_idx").on(t.quotationId)],
);

/** Frozen copy of a quotation every time it's sent or revised. */
export const quotationVersions = pgTable(
  "quotation_versions",
  {
    id: id(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("quotation_versions_unique").on(t.quotationId, t.version)],
);

/** Every client interaction with the quote link — the acceptance record lives here. */
export const quotationActivity = pgTable(
  "quotation_activity",
  {
    id: id(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    action: text("action", { enum: ["SENT", "VIEWED", "DOWNLOADED", "ACCEPTED", "REJECTED", "CHANGES_REQUESTED"] }).notNull(),
    name: text("name"),
    message: text("message"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("quotation_activity_q_idx").on(t.quotationId)],
);

/* ───────────────────────────── Bookings & events ───────────────────────────── */

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    number: text("number").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    quotationId: uuid("quotation_id")
      .unique()
      .references(() => quotations.id, { onDelete: "set null" }),
    packageId: uuid("package_id").references(() => packages.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id, { onDelete: "set null" }),
    status: bookingStatus("status").notNull().default("PENDING"),
    /** Contract value (NPR). */
    totalAmount: money("total_amount"),
    depositAmount: money("deposit_amount"),
    /** Maintained by trigger from payments. */
    amountPaid: money("amount_paid"),
    depositDueDate: date("deposit_due_date"),
    balanceDueDate: date("balance_due_date"),
    sourceKey: text("source_key").references(() => campaignSources.key, { onUpdate: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    confirmedAt: ts("confirmed_at"),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    index("bookings_customer_idx").on(t.customerId),
    index("bookings_status_idx").on(t.status),
    index("bookings_created_idx").on(t.createdAt),
    check("bookings_amounts_check", sql`${t.totalAmount} >= 0 and ${t.depositAmount} >= 0 and ${t.depositAmount} <= ${t.totalAmount}`),
  ],
);

/** What was booked — copied from the accepted quotation, the basis for invoices. */
export const bookingItems = pgTable(
  "booking_items",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    quantity: qty("quantity"),
    unit: text("unit"),
    unitPrice: money("unit_price"),
    amount: money("amount"),
    inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
  },
  (t) => [index("booking_items_booking_idx").on(t.bookingId)],
);

/** The operational workspace of a booking. Date/venue live here; money lives on the booking. */
export const events = pgTable(
  "events",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id),
    title: text("title").notNull(),
    eventType: text("event_type"),
    eventDate: date("event_date").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    /** Window the décor team is committed (setup → dismantle) — used for conflicts and inventory. */
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at").notNull(),
    venue: text("venue"),
    venueAddress: text("venue_address"),
    guestCount: integer("guest_count"),
    status: eventStatus("status").notNull().default("PLANNING"),
    requirements: text("requirements"),
    colorTheme: text("color_theme"),
    /** Estimated cost entered while planning, compared with actual cost for profitability. */
    estimatedCost: money("estimated_cost"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("events_date_idx").on(t.eventDate), index("events_window_idx").on(t.startAt, t.endAt), index("events_customer_idx").on(t.customerId)],
);

export const eventTasks = pgTable(
  "event_tasks",
  {
    id: id(),
    /** Null for general business tasks. */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** PRE / POST for checklist items, null for regular tasks. */
    checklist: text("checklist", { enum: ["PRE", "POST"] }),
    assigneeStaffId: uuid("assignee_staff_id").references(() => staff.id, { onDelete: "set null" }),
    assigneeUserId: uuid("assignee_user_id").references(() => profiles.id, { onDelete: "set null" }),
    dueAt: ts("due_at"),
    priority: priority("priority").notNull().default("MEDIUM"),
    status: taskStatus("status").notNull().default("TODO"),
    position: integer("position").notNull().default(0),
    completedAt: ts("completed_at"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tasks_event_idx").on(t.eventId), index("tasks_staff_idx").on(t.assigneeStaffId), index("tasks_user_idx").on(t.assigneeUserId), index("tasks_due_idx").on(t.status, t.dueAt)],
);

export const checklistTemplates = pgTable("checklist_templates", {
  id: id(),
  name: text("name").notNull(),
  phase: text("phase", { enum: ["PRE", "POST"] }).notNull(),
  items: textArray("items"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const eventTimeline = pgTable(
  "event_timeline",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    title: text("title").notNull(),
    responsibleStaffId: uuid("responsible_staff_id").references(() => staff.id, { onDelete: "set null" }),
    status: taskStatus("status").notNull().default("TODO"),
    notes: text("notes"),
  },
  (t) => [index("timeline_event_idx").on(t.eventId, t.startsAt)],
);

export const eventNotes = pgTable(
  "event_notes",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** Shared notes appear in the client portal; internal ones never do. */
    visibility: text("visibility", { enum: ["INTERNAL", "CLIENT"] }).notNull().default("INTERNAL"),
    authorId: uuid("author_id").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("event_notes_event_idx").on(t.eventId)],
);

export const staffAssignments = pgTable(
  "staff_assignments",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    role: text("role"),
    /** Days billed for profitability. */
    days: numeric("days", { precision: 4, scale: 1, mode: "number" }).notNull().default(1),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("staff_assignment_unique").on(t.eventId, t.staffId), index("staff_assignment_staff_idx").on(t.staffId)],
);

export const vendorAssignments = pgTable(
  "vendor_assignments",
  {
    id: id(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    cost: money("cost"),
    dueDate: date("due_date"),
    status: vendorAssignmentStatus("status").notNull().default("REQUESTED"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("vendor_assign_event_idx").on(t.eventId), index("vendor_assign_vendor_idx").on(t.vendorId)],
);

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .unique()
      .references(() => events.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["ACTIVE", "RELEASED", "CLOSED"] }).notNull().default("ACTIVE"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("reservations_booking_idx").on(t.bookingId)],
);

export const inventoryReservationItems = pgTable(
  "inventory_reservation_items",
  {
    id: id(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => inventoryReservations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    status: reservationStatus("status").notNull().default("RESERVED"),
    returnedDamaged: integer("returned_damaged").notNull().default(0),
    returnedLost: integer("returned_lost").notNull().default(0),
    /** Consumables used up at the event. */
    used: integer("used").notNull().default(0),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("reservation_item_unique").on(t.reservationId, t.itemId),
    index("reservation_items_item_idx").on(t.itemId, t.status),
    check(
      "reservation_items_quantity_check",
      sql`${t.quantity} >= 0 and ${t.returnedDamaged} >= 0 and ${t.returnedLost} >= 0 and ${t.used} >= 0 and ${t.returnedDamaged} + ${t.returnedLost} + ${t.used} <= ${t.quantity}`,
    ),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    type: movementType("type").notNull(),
    /** Units moved (positive). ADJUSTMENT stores the signed change. */
    quantity: integer("quantity").notNull(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    reference: text("reference"),
    notes: text("notes"),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("movements_item_idx").on(t.itemId, t.createdAt), index("movements_created_idx").on(t.createdAt)],
);

export const designApprovals = pgTable(
  "design_approvals",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** Files in event-media. */
    mediaIds: uuid("media_ids").array().notNull().default(sql`'{}'::uuid[]`),
    version: integer("version").notNull().default(1),
    status: designStatus("status").notNull().default("DRAFT"),
    clientResponse: text("client_response"),
    sentAt: ts("sent_at"),
    viewedAt: ts("viewed_at"),
    respondedAt: ts("responded_at"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("designs_event_idx").on(t.eventId)],
);

/* ───────────────────────────── Finance ───────────────────────────── */

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    number: text("number").notNull().unique(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    issueDate: date("issue_date").notNull().defaultNow(),
    dueDate: date("due_date"),
    status: invoiceStatus("status").notNull().default("DRAFT"),
    subtotal: money("subtotal"),
    discountAmount: money("discount_amount"),
    taxAmount: money("tax_amount"),
    total: money("total"),
    /** Maintained by trigger from payments. */
    amountPaid: money("amount_paid"),
    notes: text("notes"),
    sentAt: ts("sent_at"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    cancelledAt: ts("cancelled_at"),
  },
  (t) => [
    index("invoices_booking_idx").on(t.bookingId),
    index("invoices_customer_idx").on(t.customerId),
    index("invoices_status_idx").on(t.status, t.dueDate),
    check("invoices_amounts_check", sql`${t.total} >= 0 and ${t.amountPaid} >= 0`),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    quantity: qty("quantity"),
    unitPrice: money("unit_price"),
    amount: money("amount"),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    /** Receipt number. */
    number: text("number").notNull().unique(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    amount: integer("amount").notNull(),
    method: paymentMethod("method").notNull(),
    paidAt: date("paid_at").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    recordedBy: uuid("recorded_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    voidedAt: ts("voided_at"),
    voidReason: text("void_reason"),
  },
  (t) => [
    index("payments_booking_idx").on(t.bookingId),
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_paid_idx").on(t.paidAt),
    check("payments_amount_positive", sql`${t.amount} > 0`),
  ],
);

export const expenseCategories = pgTable("expense_categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
});

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
    date: date("date").notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    /** Set when the expense pays a vendor booking — that's what "vendor payments" are. */
    vendorAssignmentId: uuid("vendor_assignment_id").references(() => vendorAssignments.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    method: paymentMethod("method").notNull().default("CASH"),
    receiptPath: text("receipt_path"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    voidedAt: ts("voided_at"),
  },
  (t) => [index("expenses_date_idx").on(t.date), index("expenses_event_idx").on(t.eventId), index("expenses_va_idx").on(t.vendorAssignmentId), index("expenses_category_idx").on(t.categoryId), check("expenses_amount_positive", sql`${t.amount} > 0`)],
);

/* ───────────────────────────── Documents ───────────────────────────── */

export const documents = pgTable(
  "documents",
  {
    id: id(),
    kind: documentKind("kind").notNull().default("OTHER"),
    title: text("title").notNull(),
    /** Always the private-documents or event-media bucket — never served publicly. */
    bucket: text("bucket").notNull().default("private-documents"),
    path: text("path").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull().default(0),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    quotationId: uuid("quotation_id").references(() => quotations.id, { onDelete: "set null" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    /** Visible in the client portal. */
    sharedWithCustomer: boolean("shared_with_customer").notNull().default(false),
    uploadedByCustomer: boolean("uploaded_by_customer").notNull().default(false),
    uploadedBy: uuid("uploaded_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [uniqueIndex("documents_bucket_path_key").on(t.bucket, t.path), index("documents_customer_idx").on(t.customerId), index("documents_event_idx").on(t.eventId)],
);

/* ───────────────────────────── Website CMS ───────────────────────────── */

/** Business configuration: key → JSON (business, quotation, invoice, notifications, seo defaults…). */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  /** Readable by the public website (business details) vs admin-only (invoice settings…). */
  isPublic: boolean("is_public").notNull().default(false),
  updatedAt: updatedAt(),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
});

export const homepageSections = pgTable("homepage_sections", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  /** Section copy and images (shape depends on the section). */
  content: jsonb("content").notNull().default({}),
  status: contentStatus("status").notNull().default("PUBLISHED"),
  position: integer("position").notNull().default(0),
  updatedAt: updatedAt(),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
});

export const socialLinks = pgTable("social_links", {
  id: id(),
  platform: text("platform").notNull().unique(),
  label: text("label").notNull(),
  url: text("url").notNull().default(""),
  handle: text("handle"),
  position: integer("position").notNull().default(0),
});

/** Per-page SEO overrides; the page's built-in title/description apply when a field is empty. */
export const seoSettings = pgTable("seo_settings", {
  path: text("path").primaryKey(),
  title: text("title"),
  description: text("description"),
  ogImageId: uuid("og_image_id").references(() => media.id, { onDelete: "set null" }),
  noindex: boolean("noindex").notNull().default(false),
  updatedAt: updatedAt(),
});

export const services = pgTable("services", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  imageId: uuid("image_id").references(() => media.id, { onDelete: "set null" }),
  eventType: text("event_type"),
  featured: boolean("featured").notNull().default(false),
  status: contentStatus("status").notNull().default("PUBLISHED"),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const serviceItems = pgTable(
  "service_items",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("service_items_service_idx").on(t.serviceId)],
);

export const testimonials = pgTable("testimonials", {
  id: id(),
  customerName: text("customer_name").notNull(),
  eventType: text("event_type").notNull(),
  quote: text("quote").notNull(),
  rating: integer("rating"),
  photoId: uuid("photo_id").references(() => media.id, { onDelete: "set null" }),
  date: date("date"),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  /** The client agreed to publish their words. */
  consent: boolean("consent").notNull().default(false),
  status: contentStatus("status").notNull().default("DRAFT"),
  /** Sample content — never shown on the live site. */
  placeholder: boolean("placeholder").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const galleryAlbums = pgTable(
  "gallery_albums",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    category: text("category", { enum: ["weddings", "engagements", "pasni", "birthdays", "corporate", "other"] }).notNull(),
    eventType: text("event_type"),
    description: text("description"),
    location: text("location"),
    eventDate: date("event_date"),
    tags: textArray("tags"),
    coverId: uuid("cover_id").references(() => media.id, { onDelete: "set null" }),
    beforeId: uuid("before_id").references(() => media.id, { onDelete: "set null" }),
    afterId: uuid("after_id").references(() => media.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    featured: boolean("featured").notNull().default(false),
    status: contentStatus("status").notNull().default("PUBLISHED"),
    placeholder: boolean("placeholder").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("albums_position_idx").on(t.status, t.position)],
);

export const galleryItems = pgTable(
  "gallery_items",
  {
    id: id(),
    albumId: uuid("album_id")
      .notNull()
      .references(() => galleryAlbums.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id),
    kind: text("kind", { enum: ["IMAGE", "VIDEO"] }).notNull().default("IMAGE"),
    title: text("title"),
    caption: text("caption"),
    tags: textArray("tags"),
    featured: boolean("featured").notNull().default(false),
    status: contentStatus("status").notNull().default("PUBLISHED"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("gallery_items_album_idx").on(t.albumId, t.position)],
);

export const catalogueSections = pgTable("catalogue_sections", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  intro: text("intro").notNull().default(""),
  position: integer("position").notNull().default(0),
  status: contentStatus("status").notNull().default("PUBLISHED"),
});

export const catalogueItems = pgTable(
  "catalogue_items",
  {
    id: id(),
    /** Stable public id used in inquiry links (?design=cat-…). */
    key: text("key").notNull().unique(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => catalogueSections.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    imageId: uuid("image_id").references(() => media.id, { onDelete: "set null" }),
    priceAmount: integer("price_amount"),
    priceUnit: text("price_unit"),
    priceFrom: boolean("price_from").notNull().default(false),
    position: integer("position").notNull().default(0),
    status: contentStatus("status").notNull().default("PUBLISHED"),
  },
  (t) => [index("catalogue_items_section_idx").on(t.sectionId, t.position)],
);

export const priceLists = pgTable("price_lists", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  rows: jsonb("rows").$type<{ label: string; amount?: number; unit?: string; from?: boolean }[]>().notNull().default([]),
  position: integer("position").notNull().default(0),
  status: contentStatus("status").notNull().default("PUBLISHED"),
});

/* ───────────────────────────── Notifications, analytics, automation ───────────────────────────── */

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    priority: priority("priority").notNull().default("MEDIUM"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    href: text("href"),
    /** Only users holding this permission see it. Null = every staff user. */
    permission: text("permission"),
    /** Direct notification for one user. */
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    /** The same key is only ever raised once. */
    dedupeKey: text("dedupe_key").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt), index("notifications_user_idx").on(t.userId)],
);

export const notificationReads = pgTable(
  "notification_reads",
  {
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    readAt: ts("read_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: id(),
    name: text("name").notNull(),
    path: text("path"),
    /** Random per-tab id — not linked to a person. */
    sessionId: text("session_id"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    referrer: text("referrer"),
    device: text("device"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    properties: jsonb("properties").$type<Record<string, string | number | boolean>>(),
    createdAt: createdAt(),
  },
  (t) => [index("analytics_name_created_idx").on(t.name, t.createdAt), index("analytics_created_idx").on(t.createdAt)],
);

export const automationRules = pgTable("automation_rules", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  trigger: text("trigger").notNull(),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").$type<Record<string, number | boolean | string>>().notNull().default({}),
  lastRunAt: ts("last_run_at"),
  runCount: integer("run_count").notNull().default(0),
  updatedAt: updatedAt(),
});

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: id(),
    ruleKey: text("rule_key").notNull(),
    summary: text("summary").notNull(),
    ok: boolean("ok").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("automation_runs_created_idx").on(t.createdAt)],
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    to: text("to").notNull(),
    template: text("template").notNull(),
    subject: text("subject").notNull(),
    status: text("status", { enum: ["SENT", "FAILED", "NOT_CONFIGURED"] }).notNull(),
    error: text("error"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    createdAt: createdAt(),
  },
  (t) => [index("outbox_created_idx").on(t.createdAt)],
);

export const backups = pgTable("backups", {
  id: id(),
  status: text("status", { enum: ["RUNNING", "COMPLETED", "FAILED"] }).notNull(),
  path: text("path"),
  size: integer("size"),
  tableCounts: jsonb("table_counts").$type<Record<string, number>>(),
  error: text("error"),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  completedAt: ts("completed_at"),
});

/** Sequential numbers per prefix and year: QT-2026-001… (used via next_document_number()). */
export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

/** Fixed-window rate limiter shared by all server instances. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: ts("reset_at").notNull(),
});
