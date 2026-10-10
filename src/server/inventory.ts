import "server-only";
import { adminDb, all, cols, exec, many, maybe, one, schema, tbl, vals, type DB, type Row } from "@/db";
import { UserError } from "@/lib/actions";
import { notify } from "./notifications";

/*
 * Availability is date-aware: units reserved for one event are only unavailable to events whose
 * décor windows (setup → dismantle) overlap.
 *
 *   usable    = quantity − damaged − in maintenance
 *   reserved  = units held for events that haven't finished (RESERVED / CHECKED_OUT)
 *   available = usable − reserved                      (lists; conservative)
 *   available for an event = usable − units held by *overlapping* events
 */

type Actor = { id: string; name: string } | null;
type Conn = DB;
type Item = Row<typeof schema.inventoryItems>;
type ReservationItem = Row<typeof schema.inventoryReservationItems>;
type Event = Row<typeof schema.events>;

const ri = tbl(schema.inventoryReservationItems);
const rh = tbl(schema.inventoryReservations);
const i = tbl(schema.inventoryItems);
const ACTIVE = ["RESERVED", "CHECKED_OUT"] as const;

export const usable = (item: { quantity: number; damaged: number; inMaintenance: number }) => Math.max(0, item.quantity - item.damaged - item.inMaintenance);

type Held = { itemId: string; quantity: number; used: number };
const heldSelect = "itemId:item_id,quantity,used,inventory_reservations!inner(event_id,events!inner(status,start_at,end_at))";

function sumHeld(rows: Held[]) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.itemId, (map.get(r.itemId) ?? 0) + Number(r.quantity) - Number(r.used));
  return map;
}

/** Units held per item by active reservations on events that haven't finished. */
export async function reservedNow(itemIds?: string[], conn: Conn = adminDb) {
  const rows = await all<Held>(() => {
    let query = conn
      .from(ri)
      .select(heldSelect)
      .in("status", [...ACTIVE])
      .neq("inventory_reservations.events.status", "CANCELLED")
      .gt("inventory_reservations.events.end_at", new Date().toISOString());
    if (itemIds?.length) query = query.in("item_id", itemIds);
    return query.order("id");
  });
  return sumHeld(rows);
}

/** Active (not archived) inventory items with derived stock figures, optionally only some ids. */
export async function inventoryWithStock(itemIds?: string[]) {
  const items = await all<Item & { inventory_categories: { name: string } | null }>(() => {
    let query = adminDb
      .from(i)
      .select(`${cols(schema.inventoryItems)},inventory_categories(name)`)
      .is("archived_at", null);
    if (itemIds?.length) query = query.in("id", itemIds);
    return query.order("name").order("id");
  });
  const reserved = await reservedNow(items.map((x) => x.id));
  return items.map(({ inventory_categories, ...item }) => {
    const res = reserved.get(item.id) ?? 0;
    const available = usable(item) - res;
    return {
      ...item,
      category: inventory_categories?.name ?? null,
      reserved: res,
      usable: usable(item),
      available,
      low: item.lowStockThreshold > 0 && available < item.lowStockThreshold,
    };
  });
}

async function overlappingReserved(conn: Conn, itemIds: string[], start: Date, end: Date, excludeEventId?: string) {
  if (!itemIds.length) return new Map<string, number>();
  const rows = await all<Held>(() => {
    let query = conn
      .from(ri)
      .select(heldSelect)
      .in("item_id", itemIds)
      .in("status", [...ACTIVE])
      .neq("inventory_reservations.events.status", "CANCELLED")
      .lt("inventory_reservations.events.start_at", end.toISOString())
      .gt("inventory_reservations.events.end_at", start.toISOString());
    if (excludeEventId) query = query.neq("inventory_reservations.event_id", excludeEventId);
    return query.order("id");
  });
  return sumHeld(rows);
}

const getEvent = (conn: Conn, eventId: string) => maybe<Event>(conn.from(tbl(schema.events)).select(cols(schema.events)).eq("id", eventId));
const getHeader = (conn: Conn, eventId: string) =>
  maybe<Row<typeof schema.inventoryReservations>>(conn.from(rh).select(cols(schema.inventoryReservations)).eq("event_id", eventId));
const itemsByIds = (conn: Conn, ids: string[]) => many<Item>(conn.from(i).select(cols(schema.inventoryItems)).in("id", ids).order("id"));

/** Every item with how many units are free for an event's window (reservation picker). */
export async function availabilityForEvent(eventId: string) {
  const event = await getEvent(adminDb, eventId);
  if (!event) throw new UserError("Event not found.");
  const items = await all<Item>(() => adminDb.from(i).select(cols(schema.inventoryItems)).is("archived_at", null).order("name").order("id"));
  const held = await overlappingReserved(
    adminDb,
    items.map((x) => x.id),
    event.startAt,
    event.endAt,
    eventId,
  );
  return items.map((item) => ({
    ...item,
    availableForEvent: usable(item) - (held.get(item.id) ?? 0),
  }));
}

async function reservationHeader(conn: Conn, eventId: string) {
  const existing = await getHeader(conn, eventId);
  if (existing) {
    if (existing.status !== "ACTIVE") await exec(conn.from(rh).update({ status: "ACTIVE" }).eq("id", existing.id));
    return existing.id;
  }
  const event = await maybe<{ bookingId: string | null }>(conn.from(tbl(schema.events)).select("bookingId:booking_id").eq("id", eventId));
  const row = await one<{ id: string }>(
    conn
      .from(rh)
      .insert(
        vals(schema.inventoryReservations, {
          eventId,
          bookingId: event?.bookingId,
        }),
      )
      .select("id"),
  );
  return row.id;
}

const movement = (conn: Conn, values: Partial<Row<typeof schema.inventoryMovements>>) =>
  exec(conn.from(tbl(schema.inventoryMovements)).insert(vals(schema.inventoryMovements, values)));

/**
 * Set reservations for an event (absolute quantities; 0 releases). Checks availability for
 * overlapping events and throws one readable error listing every shortage.
 */
export async function setReservations(conn: Conn, eventId: string, lines: { itemId: string; quantity: number }[], actor: Actor, reference?: string) {
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + Math.max(0, Math.round(l.quantity)));
  if (!merged.size) return;
  const ids = [...merged.keys()].sort();

  const event = await getEvent(conn, eventId);
  if (!event) throw new UserError("Event not found.");
  if (event.status === "CANCELLED") throw new UserError("This event is cancelled.");

  const items = await itemsByIds(conn, ids);
  const held = await overlappingReserved(conn, ids, event.startAt, event.endAt, eventId);
  const shortages: string[] = [];
  for (const item of items) {
    const want = merged.get(item.id)!;
    const free = usable(item) - (held.get(item.id) ?? 0);
    if (want > free) shortages.push(`${item.name}: ${Math.max(0, free)} available, ${want} needed`);
  }
  if (shortages.length) throw new UserError(`Not enough stock for this date — ${shortages.join("; ")}.`);

  const reservationId = await reservationHeader(conn, eventId);
  const existing = await many<ReservationItem>(conn.from(ri).select(cols(schema.inventoryReservationItems)).eq("reservation_id", reservationId).in("item_id", ids));
  for (const item of items) {
    const want = merged.get(item.id)!;
    const current = existing.find((x) => x.itemId === item.id);
    const before = current && ACTIVE.includes(current.status as (typeof ACTIVE)[number]) ? current.quantity : 0;
    if (want === before) continue;
    if (current?.status === "CHECKED_OUT" && want < before) throw new UserError(`${item.name} is already out at the event — record a return instead.`);
    if (current) {
      await exec(
        conn
          .from(ri)
          .update({
            quantity: want,
            status: want === 0 ? "RELEASED" : current.status === "CHECKED_OUT" ? "CHECKED_OUT" : "RESERVED",
          })
          .eq("id", current.id),
      );
    } else if (want > 0) {
      await exec(
        conn.from(ri).insert(
          vals(schema.inventoryReservationItems, {
            reservationId,
            itemId: item.id,
            quantity: want,
          }),
        ),
      );
    }
    await movement(conn, {
      itemId: item.id,
      type: want > before ? "RESERVATION" : "RELEASE",
      quantity: Math.abs(want - before),
      eventId,
      reference: reference ?? event.title,
      userId: actor?.id,
    });
  }
}

/** Release everything still reserved for an event (cancellation). */
export async function releaseEvent(conn: Conn, eventId: string, actor: Actor, reason: string) {
  const header = await getHeader(conn, eventId);
  if (!header) return;
  const held = await many<ReservationItem>(conn.from(ri).select(cols(schema.inventoryReservationItems)).eq("reservation_id", header.id).eq("status", "RESERVED"));
  for (const r of held) {
    await exec(conn.from(ri).update({ status: "RELEASED" }).eq("id", r.id));
    await movement(conn, {
      itemId: r.itemId,
      type: "RELEASE",
      quantity: r.quantity,
      eventId,
      reference: reason,
      userId: actor?.id,
    });
  }
  await exec(conn.from(rh).update({ status: "RELEASED" }).eq("id", header.id));
}

/** Check reservations still fit after an event's dates change. */
export async function recheckEventReservations(conn: Conn, eventId: string) {
  const header = await getHeader(conn, eventId);
  if (!header) return;
  const held = await many<ReservationItem>(
    conn
      .from(ri)
      .select(cols(schema.inventoryReservationItems))
      .eq("reservation_id", header.id)
      .in("status", [...ACTIVE]),
  );
  if (!held.length) return;
  const event = await getEvent(conn, eventId);
  if (!event) return;
  const ids = held.map((h) => h.itemId);
  const items = await itemsByIds(conn, ids);
  const others = await overlappingReserved(conn, ids, event.startAt, event.endAt, eventId);
  const shortages = items
    .map((item) => {
      const want = held.find((h) => h.itemId === item.id)!.quantity;
      const free = usable(item) - (others.get(item.id) ?? 0);
      return want > free ? `${item.name} (${Math.max(0, free)} free on the new date, ${want} reserved)` : null;
    })
    .filter(Boolean);
  if (shortages.length) throw new UserError(`The new date clashes with other bookings — ${shortages.join("; ")}. Adjust the reservation first.`);
}

/** Mark reserved items as loaded and out at the event. */
export async function checkOutEvent(conn: Conn, eventId: string, actor: Actor) {
  const header = await getHeader(conn, eventId);
  if (!header) return 0;
  const held = await many<ReservationItem>(conn.from(ri).select(cols(schema.inventoryReservationItems)).eq("reservation_id", header.id).eq("status", "RESERVED"));
  for (const r of held) {
    await exec(conn.from(ri).update({ status: "CHECKED_OUT" }).eq("id", r.id));
    await movement(conn, {
      itemId: r.itemId,
      type: "CHECK_OUT",
      quantity: r.quantity,
      eventId,
      userId: actor?.id,
    });
  }
  return held.length;
}

/** Items come back from an event: record damaged, lost and (for consumables) used units. */
export async function returnReservationItem(conn: Conn, reservationItemId: string, damaged: number, lost: number, used: number, actor: Actor, notes?: string | null) {
  const r = await maybe<ReservationItem>(conn.from(ri).select(cols(schema.inventoryReservationItems)).eq("id", reservationItemId));
  if (!r) throw new UserError("Reservation not found.");
  if (!ACTIVE.includes(r.status as (typeof ACTIVE)[number])) throw new UserError("These items have already been returned or released.");
  if (damaged + lost + used > r.quantity) throw new UserError("Damaged, lost and used together can't exceed the quantity sent out.");
  const header = await one<{ eventId: string }>(conn.from(rh).select("eventId:event_id").eq("id", r.reservationId));
  const item = await one<Item>(conn.from(i).select(cols(schema.inventoryItems)).eq("id", r.itemId));
  await exec(
    conn
      .from(ri)
      .update(
        vals(schema.inventoryReservationItems, {
          status: "RETURNED",
          returnedDamaged: damaged,
          returnedLost: lost,
          used,
          notes: notes ?? r.notes,
        }),
      )
      .eq("id", r.id),
  );
  const back = r.quantity - lost - used;
  if (back > 0)
    await movement(conn, {
      itemId: item.id,
      type: "RETURN",
      quantity: back,
      eventId: header.eventId,
      notes,
      userId: actor?.id,
    });
  if (damaged) {
    await exec(
      conn
        .from(i)
        .update({ damaged: item.damaged + damaged })
        .eq("id", item.id),
    );
    await movement(conn, {
      itemId: item.id,
      type: "DAMAGE",
      quantity: damaged,
      eventId: header.eventId,
      notes: notes ?? "Returned damaged",
      userId: actor?.id,
    });
  }
  if (lost + used) {
    await exec(
      conn
        .from(i)
        .update({
          quantity: Math.max(item.damaged + damaged + item.inMaintenance, item.quantity - lost - used),
        })
        .eq("id", item.id),
    );
    if (lost)
      await movement(conn, {
        itemId: item.id,
        type: "LOSS",
        quantity: lost,
        eventId: header.eventId,
        notes: notes ?? "Not returned",
        userId: actor?.id,
      });
    if (used)
      await movement(conn, {
        itemId: item.id,
        type: "USAGE",
        quantity: used,
        eventId: header.eventId,
        notes: notes ?? "Used at event",
        userId: actor?.id,
      });
  }
}

export type StockOp = "STOCK_IN" | "STOCK_OUT" | "DAMAGE" | "REPAIRED" | "LOSS" | "MAINTENANCE_IN" | "MAINTENANCE_OUT" | "ADJUSTMENT";

/**
 * Manual stock change. For ADJUSTMENT `quantity` is the newly counted total; otherwise it's the
 * number of units moved. Every change is logged as a movement.
 */
export async function applyStockOp(conn: Conn, itemId: string, op: StockOp, quantity: number, actor: Actor, notes?: string | null, reference?: string | null) {
  const item = await maybe<Item>(conn.from(i).select(cols(schema.inventoryItems)).eq("id", itemId));
  if (!item) throw new UserError("Item not found.");
  const q = Math.round(quantity);
  if (op !== "ADJUSTMENT" && q <= 0) throw new UserError("Quantity must be at least 1.");
  const free = usable(item);
  const next = {
    quantity: item.quantity,
    damaged: item.damaged,
    inMaintenance: item.inMaintenance,
  };
  let logged = q;
  switch (op) {
    case "STOCK_IN":
      next.quantity += q;
      break;
    case "STOCK_OUT":
    case "LOSS":
      if (q > free) throw new UserError(`Only ${free} usable units to remove.`);
      next.quantity -= q;
      break;
    case "DAMAGE":
      if (q > free) throw new UserError(`Only ${free} usable units can be marked damaged.`);
      next.damaged += q;
      break;
    case "REPAIRED":
      if (q > item.damaged) throw new UserError(`Only ${item.damaged} units are marked damaged.`);
      next.damaged -= q;
      break;
    case "MAINTENANCE_IN":
      if (q > free) throw new UserError(`Only ${free} usable units can go to maintenance.`);
      next.inMaintenance += q;
      break;
    case "MAINTENANCE_OUT":
      if (q > item.inMaintenance) throw new UserError(`Only ${item.inMaintenance} units are in maintenance.`);
      next.inMaintenance -= q;
      break;
    case "ADJUSTMENT":
      if (q < item.damaged + item.inMaintenance) throw new UserError("The counted total can't be less than damaged + maintenance units.");
      logged = q - item.quantity;
      next.quantity = q;
      break;
  }
  await exec(conn.from(i).update(vals(schema.inventoryItems, next)).eq("id", itemId));
  await movement(conn, {
    itemId,
    type: op,
    quantity: op === "ADJUSTMENT" ? logged : q,
    notes,
    reference,
    userId: actor?.id,
  });
  return next;
}

/** Raise low-stock alerts (deduplicated per item per day). */
export async function checkLowStock(itemIds?: string[]) {
  const rule = await maybe<{ enabled: boolean }>(adminDb.from(tbl(schema.automationRules)).select("enabled").eq("key", "inventory.low"));
  if (rule && !rule.enabled) return 0;
  const items = await inventoryWithStock(itemIds);
  const day = new Date().toISOString().slice(0, 10);
  let raised = 0;
  for (const item of items.filter((x) => x.low)) {
    await notify({
      type: "inventory.low",
      title: `Low stock: ${item.name}`,
      body: `${item.available} available, threshold ${item.lowStockThreshold} ${item.unit}.`,
      href: `/admin/inventory/${item.id}`,
      priority: "HIGH",
      entityType: "inventory_item",
      entityId: item.id,
      permission: "inventory.view",
      dedupeKey: `low:${item.id}:${day}`,
    });
    raised++;
  }
  return raised;
}

/** Inventory a package needs, ready for setReservations. */
export async function packageRequirements(conn: Conn, packageId: string) {
  const rows = await many<{ itemId: string | null; quantity: number }>(conn.from(tbl(schema.packageItems)).select("itemId:inventory_item_id,quantity").eq("package_id", packageId));
  return rows.filter((x): x is { itemId: string; quantity: number } => !!x.itemId);
}
