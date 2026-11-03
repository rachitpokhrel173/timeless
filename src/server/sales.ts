import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminDb, cols, exec, likeEscape, many, maybe, one, rpc, schema, tbl, vals, type DB, type Row, type Tx } from "@/db";
import { UserError } from "@/lib/actions";
import { todayISO } from "@/lib/format";
import { couponDiscount, depositShare, quoteTotals } from "@/lib/quote-math";
import { advanceLead, logLeadActivity } from "./crm";
import { checkOutEvent, describeShortages, releaseEvent, setReservations } from "./inventory";
import { nextNumber } from "./numbering";
import type { PackageSnapshot } from "@/db/schema";

type Actor = { id: string; name: string } | null;
type Conn = DB;
type Quote = Row<typeof schema.quotations>;
type QuoteItem = Row<typeof schema.quotationItems>;
const q = schema.quotations;
const qt = tbl(q);
const getQuote = (conn: Conn, id: string) => maybe<Quote>(conn.from(qt).select(cols(q)).eq("id", id));
const quoteItems = (conn: Conn, quotationId: string) =>
  many<QuoteItem>(conn.from(tbl(schema.quotationItems)).select(cols(schema.quotationItems)).eq("quotation_id", quotationId).order("position"));
const quoteActivity = (conn: Conn, values: Partial<Row<typeof schema.quotationActivity>>) =>
  exec(conn.from(tbl(schema.quotationActivity)).insert(vals(schema.quotationActivity, values)));

export const newToken = () => randomBytes(24).toString("base64url");

/** Staff approvals (convert-to-booking) store their accepted name with this prefix. */
const STAFF_APPROVED = "Approved by ";

/** Who accepted a quotation and whether they did it themselves through the client link. */
export function quoteAcceptance(quote: { acceptedAt: Date | string | null; acceptedName: string | null }) {
  if (!quote.acceptedAt) return null;
  const online = !quote.acceptedName?.startsWith(STAFF_APPROVED);
  return { online, name: quote.acceptedName, at: quote.acceptedAt };
}

/* ───────────────────────── Quotations ───────────────────────── */

export type QuoteInput = {
  customerId: string;
  leadId?: string | null;
  inquiryId?: string | null;
  packageId?: string | null;
  couponCode?: string | null;
  title: string;
  eventType?: string | null;
  eventDate?: string | null;
  venue?: string | null;
  guestCount?: number | null;
  validUntil?: string | null;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  taxRate: number;
  /** Advance to confirm, in NPR (capped at the total). */
  depositAmount: number;
  notes?: string | null;
  terms?: string | null;
  termsVersion?: string | null;
  items: {
    description: string;
    details?: string | null;
    quantity: number;
    unit?: string | null;
    unitPrice: number;
    inventoryItemId?: string | null;
  }[];
};

const EDITABLE = ["DRAFT", "SENT", "VIEWED"] as const;

async function resolveCoupon(conn: Conn, code: string | null | undefined, subtotal: number) {
  if (!code) return null;
  const wanted = code.trim().toUpperCase();
  const coupons = await many<Row<typeof schema.coupons>>(conn.from(tbl(schema.coupons)).select(cols(schema.coupons)).ilike("code", likeEscape(wanted)));
  const coupon = coupons.find((c) => c.code.toUpperCase() === wanted);
  if (!coupon || !coupon.active)
    throw new UserError(`Coupon “${code}” isn't active.`, {
      couponCode: "Unknown or inactive coupon.",
    });
  if (coupon.expiresAt && coupon.expiresAt < todayISO()) throw new UserError("That coupon has expired.", { couponCode: "Expired." });
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)
    throw new UserError("That coupon has been used up.", {
      couponCode: "Usage limit reached.",
    });
  if (subtotal < coupon.minAmount)
    throw new UserError(`That coupon needs a subtotal of at least NPR ${coupon.minAmount.toLocaleString("en-IN")}.`, { couponCode: "Minimum not met." });
  return coupon;
}

async function snapshot(conn: Conn, quotationId: string) {
  const [quote, items] = await Promise.all([getQuote(conn, quotationId), quoteItems(conn, quotationId)]);
  return { quote, items };
}

/** Freeze the current state as a version (on send and on edits after sending). */
async function saveVersion(conn: Conn, quotationId: string, actor: Actor, reason: string) {
  const { quote, items } = await snapshot(conn, quotationId);
  if (!quote) return;
  const snap = JSON.parse(JSON.stringify({ quote, items })) as Record<string, unknown>;
  const existing = await maybe<{ id: string }>(conn.from(tbl(schema.quotationVersions)).select("id").eq("quotation_id", quotationId).eq("version", quote.version));
  if (existing) await exec(conn.from(tbl(schema.quotationVersions)).update({ snapshot: snap, reason }).eq("id", existing.id));
  else
    await exec(
      conn.from(tbl(schema.quotationVersions)).insert(
        vals(schema.quotationVersions, {
          quotationId,
          version: quote.version,
          snapshot: snap,
          reason,
          createdBy: actor?.id,
        }),
      ),
    );
}

/**
 * Freeze a package as it is right now (name, price, contents, add-ons). Quotations and bookings
 * keep this copy, so editing or deleting the package later never changes what was agreed or what
 * stock gets reserved.
 */
export async function takePackageSnapshot(conn: Conn, packageId: string): Promise<PackageSnapshot | null> {
  const pkg = await maybe<{ id: string; name: string; price: number; priceFrom: boolean; addOns: PackageSnapshot["addOns"] | null }>(
    conn.from(tbl(schema.packages)).select("id,name,price,priceFrom:price_from,addOns:add_ons").eq("id", packageId),
  );
  if (!pkg) return null;
  const items = await many<{ label: string; quantity: number; inventoryItemId: string | null }>(
    conn.from(tbl(schema.packageItems)).select("label,quantity,inventoryItemId:inventory_item_id").eq("package_id", packageId).order("position"),
  );
  return { id: pkg.id, name: pkg.name, price: pkg.price, priceFrom: pkg.priceFrom, takenAt: new Date().toISOString(), items, addOns: Array.isArray(pkg.addOns) ? pkg.addOns : [] };
}

/** Stock a package snapshot needs, ready for setReservations. */
const snapshotNeeds = (snap: PackageSnapshot | null | undefined) =>
  (snap?.items ?? []).filter((i): i is typeof i & { inventoryItemId: string } => !!i.inventoryItemId).map((i) => ({ itemId: i.inventoryItemId, quantity: i.quantity }));

/** Create or update a quotation. Totals are always recomputed on the server. */
export async function saveQuotation(conn: Conn, input: QuoteInput, actor: Actor, id?: string) {
  if (!input.items.length) throw new UserError("Add at least one line item.");
  let wasSent = false;
  let version = 1;
  let previous: { packageId: string | null; packageSnapshot: PackageSnapshot | null } | null = null;
  if (id) {
    const existing = await getQuote(conn, id);
    if (!existing) throw new UserError("Quotation not found.");
    if (!EDITABLE.includes(existing.status as (typeof EDITABLE)[number])) {
      throw new UserError(`An ${existing.status.toLowerCase()} quotation can't be edited — duplicate it to make a new one.`);
    }
    wasSent = !!existing.sentAt;
    previous = { packageId: existing.packageId, packageSnapshot: existing.packageSnapshot ?? null };
    // Editing a quote the client has already received starts a new version
    version = wasSent ? existing.version + 1 : existing.version;
  }

  const base = quoteTotals({
    items: input.items,
    discountType: input.discountType,
    discountValue: input.discountValue,
    taxRate: input.taxRate,
    depositAmount: input.depositAmount,
  });
  const coupon = await resolveCoupon(conn, input.couponCode, base.subtotal);
  let discountType = input.discountType;
  let discountValue = input.discountValue;
  if (coupon) {
    const cd = couponDiscount(coupon, base.subtotal);
    if (cd > base.discountAmount) {
      discountType = "FIXED";
      discountValue = cd;
    }
  }
  const t = quoteTotals({
    items: input.items,
    discountType,
    discountValue,
    taxRate: input.taxRate,
    depositAmount: input.depositAmount,
  });

  // The package is copied when it's first put on the quote; re-saving keeps that copy
  const packageSnapshot = !input.packageId
    ? null
    : previous?.packageId === input.packageId && previous.packageSnapshot
      ? previous.packageSnapshot
      : await takePackageSnapshot(conn, input.packageId);

  const values = {
    customerId: input.customerId,
    leadId: input.leadId,
    inquiryId: input.inquiryId,
    packageId: input.packageId,
    packageSnapshot,
    couponId: coupon?.id ?? null,
    title: input.title,
    eventType: input.eventType,
    eventDate: input.eventDate,
    venue: input.venue,
    guestCount: input.guestCount,
    validUntil: input.validUntil,
    discountType,
    discountValue,
    taxRate: input.taxRate,
    depositPercent: depositShare(t.depositAmount, t.total),
    notes: input.notes,
    terms: input.terms,
    termsVersion: input.termsVersion,
    subtotal: t.subtotal,
    discountAmount: t.discountAmount,
    taxAmount: t.taxAmount,
    total: t.total,
    depositAmount: t.depositAmount,
    version,
  };

  let quoteId = id;
  if (id) {
    await exec(conn.from(qt).update(vals(q, values)).eq("id", id));
    await exec(conn.from(tbl(schema.quotationItems)).delete().eq("quotation_id", id));
  } else {
    const row = await one<{ id: string }>(
      conn
        .from(qt)
        .insert(
          vals(q, {
            ...values,
            number: await nextNumber("QT", conn),
            publicToken: newToken(),
            createdBy: actor?.id,
          }),
        )
        .select("id"),
    );
    quoteId = row.id;
  }
  const lines = vals(
    schema.quotationItems,
    input.items.map((it, position) => ({
      quotationId: quoteId!,
      position,
      description: it.description,
      details: it.details,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      amount: Math.round(it.quantity * it.unitPrice),
      inventoryItemId: it.inventoryItemId,
    })),
  );
  await exec(conn.from(tbl(schema.quotationItems)).insert(lines));
  if (wasSent) await saveVersion(conn, quoteId!, actor, `Revised by ${actor?.name ?? "staff"}`);
  return quoteId!;
}

/** Copy a quotation into a new draft (new number and private link). */
export async function duplicateQuotation(conn: Conn, id: string, actor: Actor) {
  const { quote: src, items } = await snapshot(conn, id);
  if (!src) throw new UserError("Quotation not found.");
  const copy = vals(q, {
    customerId: src.customerId,
    leadId: src.leadId,
    inquiryId: src.inquiryId,
    packageId: src.packageId,
    packageSnapshot: src.packageSnapshot,
    title: src.title,
    eventType: src.eventType,
    eventDate: src.eventDate,
    venue: src.venue,
    guestCount: src.guestCount,
    validUntil: todayISO(14),
    subtotal: src.subtotal,
    discountType: src.discountType,
    discountValue: src.discountValue,
    discountAmount: src.discountAmount,
    taxRate: src.taxRate,
    taxAmount: src.taxAmount,
    total: src.total,
    depositPercent: src.depositPercent,
    depositAmount: src.depositAmount,
    notes: src.notes,
    terms: src.terms,
    termsVersion: src.termsVersion,
    referenceMediaIds: src.referenceMediaIds,
    number: await nextNumber("QT", conn),
    publicToken: newToken(),
    status: "DRAFT",
    issueDate: todayISO(),
    createdBy: actor?.id,
  });
  const row = await one<{ id: string }>(conn.from(qt).insert(copy).select("id"));
  if (items.length) {
    await exec(
      conn.from(tbl(schema.quotationItems)).insert(
        vals(
          schema.quotationItems,
          items.map(({ id: _iid, quotationId: _q, ...it }) => ({
            ...it,
            quotationId: row.id,
          })),
        ),
      ),
    );
  }
  return row.id;
}

/** Mark as sent (records a version) and move the lead to "Quoted". */
export async function markSent(conn: Conn, id: string, actor: Actor) {
  const quote = await getQuote(conn, id);
  if (!quote) throw new UserError("Quotation not found.");
  if (!EDITABLE.includes(quote.status as (typeof EDITABLE)[number])) throw new UserError(`This quotation is ${quote.status.toLowerCase()}.`);
  if (quote.validUntil && quote.validUntil < todayISO()) throw new UserError("The valid-until date has passed — update it before sending.");
  await exec(
    conn
      .from(qt)
      .update(
        vals(q, {
          status: quote.status === "DRAFT" ? "SENT" : quote.status,
          sentAt: new Date(),
          issueDate: quote.sentAt ? quote.issueDate : todayISO(),
        }),
      )
      .eq("id", id),
  );
  await quoteActivity(conn, {
    quotationId: id,
    action: "SENT",
    name: actor?.name,
  });
  await saveVersion(conn, id, actor, quote.sentAt ? "Re-sent" : "Sent to client");
  await advanceLead(conn, quote.leadId, "QUOTED", actor, `Quotation ${quote.number} sent`);
  if (quote.leadId) await logLeadActivity(conn, quote.leadId, "QUOTATION", `Quotation ${quote.number} sent (v${quote.version})`, actor?.id, { quotationId: id });
  return quote;
}

const PUBLIC_KEYS = [
  "id",
  "number",
  "title",
  "eventType",
  "eventDate",
  "venue",
  "guestCount",
  "status",
  "version",
  "issueDate",
  "validUntil",
  "subtotal",
  "discountAmount",
  "taxRate",
  "taxAmount",
  "total",
  "depositPercent",
  "depositAmount",
  "terms",
  "termsVersion",
  "referenceMediaIds",
  "acceptedAt",
  "acceptedName",
  "respondedAt",
  "clientMessage",
  "sentAt",
] as const satisfies readonly (keyof Quote)[];
type PublicKey = (typeof PUBLIC_KEYS)[number];

/** Everything the public quote page may show — never internal notes. Privileged read by token. */
export async function publicQuote(token: string) {
  if (!token || token.length < 20) return null;
  const found = await maybe<
    Pick<Quote, PublicKey> & {
      customer: { name: string; email: string | null; phone: string | null };
    }
  >(
    adminDb
      .from(qt)
      .select(`${cols(q, [...PUBLIC_KEYS])},customer:customers!inner(name,email,phone)`)
      .eq("public_token", token)
      .not("sent_at", "is", null)
      .is("deleted_at", null),
  );
  if (!found) return null;
  const { customer, ...rest } = found;
  const row = {
    ...rest,
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
  };
  const items = await many<Pick<QuoteItem, "description" | "details" | "quantity" | "unit" | "unitPrice" | "amount">>(
    adminDb
      .from(tbl(schema.quotationItems))
      .select(cols(schema.quotationItems, ["description", "details", "quantity", "unit", "unitPrice", "amount"]))
      .eq("quotation_id", row.id)
      .order("position"),
  );
  const expired = row.status === "EXPIRED" || (!!row.validUntil && row.validUntil < todayISO() && !["ACCEPTED", "REJECTED"].includes(row.status));
  return { ...row, items, expired };
}

export type ClientDecision = {
  action: "ACCEPTED" | "REJECTED" | "CHANGES_REQUESTED";
  name?: string | null;
  message?: string | null;
  ipHash: string | null;
  userAgent: string | null;
};

/** A client's response from the public quote link (privileged, validated by token). */
export async function recordClientDecision(tx: Tx, token: string, d: ClientDecision) {
  const quote = await maybe<Quote>(tx.from(qt).select(cols(q)).eq("public_token", token));
  if (!quote || !quote.sentAt || quote.deletedAt) throw new UserError("This quotation link is no longer valid.");
  if (!["SENT", "VIEWED"].includes(quote.status)) throw new UserError(`This quotation has already been ${quote.status.toLowerCase()}.`);
  if (quote.validUntil && quote.validUntil < todayISO()) throw new UserError("This quotation has expired. Please contact us for an updated quote.");

  const now = new Date();
  if (d.action === "ACCEPTED") {
    const items = await quoteItems(tx, quote.id);
    await exec(
      tx
        .from(qt)
        .update(
          vals(q, {
            status: "ACCEPTED",
            acceptedAt: now,
            respondedAt: now,
            acceptedName: d.name,
            acceptedIpHash: d.ipHash,
            clientMessage: d.message,
          }),
        )
        .eq("id", quote.id),
    );
    // The acceptance record: exactly what was agreed, frozen at this moment
    await quoteActivity(tx, {
      quotationId: quote.id,
      action: "ACCEPTED",
      name: d.name,
      message: d.message,
      ipHash: d.ipHash,
      userAgent: d.userAgent,
      snapshot: {
        number: quote.number,
        version: quote.version,
        total: quote.total,
        depositAmount: quote.depositAmount,
        items: items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          amount: i.amount,
        })),
        termsVersion: quote.termsVersion,
        termsSha256: createHash("sha256")
          .update(quote.terms ?? "")
          .digest("hex"),
      },
    });
    await countCouponUse(tx, quote.couponId);
    await advanceLead(tx, quote.leadId, "CONFIRMED", null, `Client accepted ${quote.number}`);
  } else {
    await exec(
      tx
        .from(qt)
        .update(
          vals(q, {
            status: d.action === "REJECTED" ? "REJECTED" : quote.status,
            respondedAt: now,
            clientMessage: d.message,
          }),
        )
        .eq("id", quote.id),
    );
    await quoteActivity(tx, {
      quotationId: quote.id,
      action: d.action,
      name: d.name,
      message: d.message,
      ipHash: d.ipHash,
      userAgent: d.userAgent,
    });
    if (quote.leadId) {
      if (d.action === "CHANGES_REQUESTED") await advanceLead(tx, quote.leadId, "NEGOTIATION", null, `Client asked for changes to ${quote.number}`);
      await logLeadActivity(
        tx,
        quote.leadId,
        "QUOTATION",
        `Client ${d.action === "REJECTED" ? "declined" : "requested changes to"} ${quote.number}${d.message ? `: “${d.message}”` : ""}`,
      );
    }
  }
  return quote;
}

/* ───────────────────────── Bookings & events ───────────────────────── */

/** Default décor window: setup from 07:00 on the day until 02:00 the next morning (Nepal time). */
export function eventWindow(eventDate: string, setupStart = "07:00", hours = 19) {
  const startAt = new Date(`${eventDate}T${setupStart}:00+05:45`);
  return { startAt, endAt: new Date(startAt.getTime() + hours * 3_600_000) };
}

export type BookingInput = {
  customerId: string;
  title: string;
  eventType?: string | null;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  venue?: string | null;
  venueAddress?: string | null;
  guestCount?: number | null;
  packageId?: string | null;
  totalAmount: number;
  depositAmount: number;
  depositDueDate?: string | null;
  balanceDueDate?: string | null;
  status: "PENDING" | "CONFIRMED";
  quotationId?: string | null;
  leadId?: string | null;
  inquiryId?: string | null;
  requirements?: string | null;
  items?: {
    description: string;
    quantity: number;
    unit?: string | null;
    unitPrice: number;
    inventoryItemId?: string | null;
  }[];
};

/**
 * Create a booking, its booked items and its event workspace, then reserve inventory (from the
 * package and from lines linked to stock). Inventory shortages don't block the booking — they're
 * returned so the team can be warned.
 */
export async function createBooking(conn: Conn, input: BookingInput, actor: Actor) {
  const customer = await maybe<Row<typeof schema.customers>>(conn.from(tbl(schema.customers)).select(cols(schema.customers)).eq("id", input.customerId));
  if (!customer) throw new UserError("Customer not found.");
  if (input.depositAmount > input.totalAmount)
    throw new UserError("The advance can't be more than the total.", {
      depositAmount: "More than the total.",
    });

  const lead = input.leadId ? await maybe<Row<typeof schema.leads>>(conn.from(tbl(schema.leads)).select(cols(schema.leads)).eq("id", input.leadId)) : null;
  const packageSnapshot = input.packageId ? await takePackageSnapshot(conn, input.packageId) : null;
  const bookingValues = vals(schema.bookings, {
    number: await nextNumber("BK", conn),
    customerId: input.customerId,
    quotationId: input.quotationId,
    packageId: input.packageId,
    packageSnapshot,
    leadId: lead?.id,
    inquiryId: input.inquiryId,
    status: input.status,
    totalAmount: input.totalAmount,
    depositAmount: input.depositAmount,
    depositDueDate: input.depositDueDate,
    balanceDueDate: input.balanceDueDate ?? input.eventDate,
    sourceKey: lead?.sourceKey ?? customer.sourceKey,
    campaignId: lead?.campaignId,
    confirmedAt: input.status === "CONFIRMED" ? new Date() : null,
    createdBy: actor?.id,
  });
  const booking = await one<Row<typeof schema.bookings>>(conn.from(tbl(schema.bookings)).insert(bookingValues).select(cols(schema.bookings)));
  if (input.items?.length) {
    const lines = vals(
      schema.bookingItems,
      input.items.map((it, position) => ({
        ...it,
        bookingId: booking.id,
        position,
        amount: Math.round(it.quantity * it.unitPrice),
      })),
    );
    await exec(conn.from(tbl(schema.bookingItems)).insert(lines));
  }

  const window = eventWindow(input.eventDate);
  const eventValues = vals(schema.events, {
    bookingId: booking.id,
    customerId: input.customerId,
    title: input.title,
    eventType: input.eventType,
    eventDate: input.eventDate,
    startTime: input.startTime,
    endTime: input.endTime,
    startAt: window.startAt,
    endAt: window.endAt,
    venue: input.venue,
    venueAddress: input.venueAddress,
    guestCount: input.guestCount,
    requirements: input.requirements,
  });
  const event = await one<Row<typeof schema.events>>(conn.from(tbl(schema.events)).insert(eventValues).select(cols(schema.events)));

  if (input.inquiryId) await exec(conn.from(tbl(schema.inquiries)).update({ status: "CONFIRMED" }).eq("id", input.inquiryId));
  await advanceLead(conn, lead?.id ?? null, "CONFIRMED", actor, `Booking ${booking.number} created`);
  if (lead) await logLeadActivity(conn, lead.id, "BOOKING", `Booking ${booking.number} created`, actor?.id, { bookingId: booking.id });

  // Inventory: package contents (as booked) + booked lines linked to stock
  const shortages = await reserveForBooking(conn, event.id, booking.number, snapshotNeeds(packageSnapshot), input.items ?? [], actor);
  return { booking, event, shortages };
}

/** A quotation with a coupon was accepted (by the client or by staff): that's one use of the coupon. */
async function countCouponUse(conn: Conn, couponId: string | null) {
  if (!couponId) return;
  const coupon = await maybe<{ usedCount: number }>(conn.from(tbl(schema.coupons)).select("usedCount:used_count").eq("id", couponId));
  if (coupon) await exec(conn.from(tbl(schema.coupons)).update({ used_count: coupon.usedCount + 1 }).eq("id", couponId));
}

/**
 * Inventory for a new booking: package contents + booked lines linked to stock. Reserves what is
 * free (partial) so the booking always stands; anything short is returned as one readable
 * message so the team can be warned. The full requirement is kept on each reservation line.
 */
async function reserveForBooking(
  conn: Conn,
  eventId: string,
  reference: string,
  packageNeeds: { itemId: string; quantity: number }[],
  items: { inventoryItemId?: string | null; quantity: number }[],
  actor: Actor,
): Promise<string | null> {
  const needs: { itemId: string; quantity: number }[] = [...packageNeeds];
  for (const it of items) if (it.inventoryItemId) needs.push({ itemId: it.inventoryItemId, quantity: Math.ceil(it.quantity) });
  if (!needs.length) return null;
  const short = await setReservations(conn, eventId, needs, actor, reference, { partial: true });
  return short.length ? `Not enough stock for this date — ${describeShortages(short)}.` : null;
}

type Converted = {
  bookingId: string;
  eventId: string | null;
  bookingNumber?: string;
  existed: boolean;
  acceptedNow?: boolean;
  leadId?: string | null;
  packageId?: string | null;
  quotationNumber?: string;
};

/**
 * Accepted (or, by staff, approved) quotation → booking + confirmed services + event workspace.
 * The core runs as one database transaction (convert_quotation_to_booking): a repeated or
 * concurrent conversion returns the booking the first one made instead of a duplicate. Lead
 * stage and inventory follow; neither can duplicate anything.
 */
export async function bookingFromQuotation(conn: Conn, quotationId: string, actor: Actor, status: "PENDING" | "CONFIRMED" = "PENDING") {
  const r = await rpc<Converted>(conn, "convert_quotation_to_booking", { p_quotation: quotationId, p_status: status, p_staff_name: actor?.name ?? null });
  if (r.existed) return { booking: { id: r.bookingId }, event: r.eventId ? { id: r.eventId } : null, shortages: null, existed: true as const };

  const number = r.bookingNumber ?? "";
  await advanceLead(conn, r.leadId ?? null, "CONFIRMED", actor, `Booking ${number} created from ${r.quotationNumber ?? "a quotation"}`);
  if (r.leadId) await logLeadActivity(conn, r.leadId, "BOOKING", `Booking ${number} created from ${r.quotationNumber ?? "a quotation"}`, actor?.id, { bookingId: r.bookingId });

  const items = await many<{ inventoryItemId: string | null; quantity: number }>(
    conn.from(tbl(schema.bookingItems)).select("inventoryItemId:inventory_item_id,quantity").eq("booking_id", r.bookingId),
  );
  // The booking keeps the package exactly as quoted. Quotes saved before snapshots existed fall
  // back to the package as it is now (the previous behaviour).
  const quoted = await maybe<{ packageSnapshot: PackageSnapshot | null }>(conn.from(qt).select("packageSnapshot:package_snapshot").eq("id", quotationId));
  const packageSnapshot = quoted?.packageSnapshot ?? (r.packageId ? await takePackageSnapshot(conn, r.packageId) : null);
  if (packageSnapshot) await exec(conn.from(tbl(schema.bookings)).update({ package_snapshot: packageSnapshot }).eq("id", r.bookingId));
  const shortages = r.eventId ? await reserveForBooking(conn, r.eventId, number, snapshotNeeds(packageSnapshot), items, actor) : null;
  return {
    booking: { id: r.bookingId, number },
    event: r.eventId ? { id: r.eventId } : null,
    shortages,
    acceptedNow: !!r.acceptedNow,
    existed: false as const,
  };
}

const BOOKING_FLOW: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "COMPLETED", "CANCELLED", "PENDING"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Status changes keep the event, lead and inventory in step. */
export async function setBookingStatus(conn: Conn, bookingId: string, status: (typeof schema.bookingStatus.enumValues)[number], actor: Actor, reason?: string | null) {
  const booking = await maybe<Row<typeof schema.bookings>>(conn.from(tbl(schema.bookings)).select(cols(schema.bookings)).eq("id", bookingId));
  if (!booking) throw new UserError("Booking not found.");
  if (booking.status === status) return booking;
  if (!BOOKING_FLOW[booking.status].includes(status)) {
    throw new UserError(`A ${booking.status.toLowerCase().replace("_", " ")} booking can't be moved to ${status.toLowerCase().replace("_", " ")}.`);
  }
  const event = await maybe<{ id: string }>(conn.from(tbl(schema.events)).select("id").eq("booking_id", bookingId).limit(1));
  const now = new Date();
  const changes = vals(schema.bookings, {
    status,
    confirmedAt: status === "CONFIRMED" ? (booking.confirmedAt ?? now) : booking.confirmedAt,
    completedAt: status === "COMPLETED" ? now : booking.completedAt,
    cancelledAt: status === "CANCELLED" ? now : null,
    cancelReason: status === "CANCELLED" ? (reason ?? null) : null,
  });
  await exec(conn.from(tbl(schema.bookings)).update(changes).eq("id", bookingId));
  if (event) {
    const eventStatus = {
      PENDING: "PLANNING",
      CONFIRMED: "PLANNING",
      IN_PROGRESS: "IN_PROGRESS",
      COMPLETED: "COMPLETED",
      CANCELLED: "CANCELLED",
    } as const;
    await exec(conn.from(tbl(schema.events)).update({ status: eventStatus[status] }).eq("id", event.id));
    if (status === "CANCELLED") await releaseEvent(conn, event.id, actor, `${booking.number} cancelled`);
    if (status === "IN_PROGRESS") await checkOutEvent(conn, event.id, actor);
  }
  if (status === "COMPLETED") {
    await advanceLead(conn, booking.leadId, "COMPLETED", actor, `Event for ${booking.number} completed`);
    if (booking.inquiryId) await exec(conn.from(tbl(schema.inquiries)).update({ status: "COMPLETED" }).eq("id", booking.inquiryId));
  }
  if (status === "CANCELLED" && booking.inquiryId) await exec(conn.from(tbl(schema.inquiries)).update({ status: "CANCELLED" }).eq("id", booking.inquiryId));
  return { ...booking, status };
}
