"use server";

import { z } from "zod";
import { adminDb, all, many, schema, tbl } from "@/db";
import { adminAction } from "@/lib/actions";
import { eventTypeOptions } from "@/server/lookups";

/*
 * Data for the dashboard calendar popup. Read-only: the calendar shows the same `events` rows the
 * Events module manages — there is no second calendar store, and nothing here writes. Date
 * changes go through the event's own edit form (audited there).
 */

export type CalendarEvent = {
  id: string;
  title: string;
  eventType: string | null;
  eventTypeLabel: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  venueAddress: string | null;
  status: string;
  customer: string | null;
  bookingNumber: string | null;
  manager: string | null;
  tasks: { total: number; done: number; overdue: number };
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

type EventRow = {
  id: string;
  title: string;
  eventType: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  venueAddress: string | null;
  status: string;
  c: { name: string } | null;
  b: { number: string } | null;
  m: { fullName: string } | null;
};

/** Events dated from `from` (inclusive) to `to` (exclusive), at most ~3 months, with task progress. */
export const calendarEvents = adminAction(
  "events.view",
  z
    .object({ from: z.string().regex(ISO_DAY), to: z.string().regex(ISO_DAY) })
    .refine((v) => v.from < v.to, "Invalid range.")
    .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 100, "Range too long."),
  async ({ from, to }, user) => {
    const [rows, types] = await Promise.all([
      all<EventRow>(() =>
        adminDb
          .from(tbl(schema.events))
          .select(
            "id,title,eventType:event_type,eventDate:event_date,startTime:start_time,endTime:end_time,venue,venueAddress:venue_address,status,c:customers(name),b:bookings(number),m:profiles!manager_id(fullName:full_name)",
          )
          .gte("event_date", from)
          .lt("event_date", to)
          .is("archived_at", null)
          .order("event_date")
          .order("start_time", { nullsFirst: false })
          .order("id"),
      ),
      eventTypeOptions(),
    ]);

    // Progress counts real tasks; cancelled work is left out so it doesn't skew the percentage
    const ids = rows.map((r) => r.id);
    const progress = new Map<string, { total: number; done: number; overdue: number }>();
    const now = Date.now();
    for (let i = 0; i < ids.length; i += 150) {
      const tasks = await many<{ eventId: string; status: string; dueAt: string | null }>(
        adminDb.from(tbl(schema.eventTasks)).select("eventId:event_id,status,dueAt:due_at").in("event_id", ids.slice(i, i + 150)).neq("status", "CANCELLED").limit(5000),
      );
      for (const t of tasks) {
        const p = progress.get(t.eventId) ?? { total: 0, done: 0, overdue: 0 };
        p.total++;
        if (t.status === "COMPLETED") p.done++;
        else if (t.dueAt && Date.parse(t.dueAt) < now) p.overdue++;
        progress.set(t.eventId, p);
      }
    }

    const bookings = user.permissions.has("bookings.view");
    return rows.map(
      (r): CalendarEvent => ({
        id: r.id,
        title: r.title,
        eventType: r.eventType,
        eventTypeLabel: types.find((t) => t.value === r.eventType)?.label ?? (r.eventType ? r.eventType.replace(/-/g, " ") : "—"),
        eventDate: r.eventDate,
        startTime: r.startTime,
        endTime: r.endTime,
        venue: r.venue,
        venueAddress: r.venueAddress,
        status: r.status,
        customer: r.c?.name ?? null,
        bookingNumber: bookings ? (r.b?.number ?? null) : null,
        manager: r.m?.fullName ?? null,
        tasks: progress.get(r.id) ?? { total: 0, done: 0, overdue: 0 },
      }),
    );
  },
);
