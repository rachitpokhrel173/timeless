import "server-only";
import { adminDb, all, cols, exec, many, maybe, schema, tbl, vals, type Row } from "@/db";
import type { RuleKey } from "@/lib/defaults";
import { fmtDate, npr, todayISO } from "@/lib/format";
import { sendEmail } from "./email";
import { vendorPaid } from "./finance";
import { checkLowStock } from "./inventory";
import { notify } from "./notifications";
import { bookingFromQuotation } from "./sales";

/*
 * Rule-based automations (System → Automations switches each on/off and tunes it).
 *   • Event rules run after the action that triggers them commits.
 *   • Daily rules run from /api/cron/automations, and at most hourly as a fallback when an admin
 *     opens the dashboard. Every run is logged; alerts are de-duplicated.
 * All automation work uses the service-role client (system actor).
 */

type Rule = typeof schema.automationRules.$inferSelect;

async function rule(key: RuleKey): Promise<Rule | null> {
  const row = await maybe<Rule>(adminDb.from(tbl(schema.automationRules)).select(cols(schema.automationRules)).eq("key", key));
  return row?.enabled ? row : null;
}

async function logRun(key: RuleKey, summary: string, ok = true) {
  await exec(adminDb.from(tbl(schema.automationRuns)).insert(vals(schema.automationRuns, { ruleKey: key, summary, ok })));
  const current = await maybe<{ runCount: number }>(adminDb.from(tbl(schema.automationRules)).select("runCount:run_count").eq("key", key));
  await exec(
    adminDb
      .from(tbl(schema.automationRules))
      .update({ last_run_at: new Date().toISOString(), run_count: (current?.runCount ?? 0) + 1 })
      .eq("key", key),
  );
}

const label = (slug?: string | null) => (slug ? slug.replace(/-/g, " ") : "event");

/* ───────── Event-driven ───────── */

export async function onInquiryCreated(d: {
  inquiryId: string;
  number: string;
  leadId: string;
  name: string;
  email?: string | null;
  eventType: string;
  eventDate?: string | null;
  guestCount?: string | null;
  kind: string;
}) {
  const r = await rule("inquiry.created");
  if (!r) return;
  await notify({
    type: "inquiry.created",
    title: `${d.kind === "BOOKING_REQUEST" ? "New booking request" : "New inquiry"} from ${d.name}`,
    body: [d.number, label(d.eventType), d.eventDate && fmtDate(d.eventDate), d.guestCount && `${d.guestCount} guests`].filter(Boolean).join(" · "),
    href: `/admin/inquiries/${d.inquiryId}`,
    priority: d.kind === "BOOKING_REQUEST" ? "HIGH" : "MEDIUM",
    entityType: "inquiry",
    entityId: d.inquiryId,
    permission: "leads.view",
  });
  let emailed = "no email given";
  if (r.config.sendConfirmation !== false && d.email) {
    emailed = (
      await sendEmail(
        d.email,
        "inquiryConfirmation",
        { name: d.name, eventType: d.eventType, eventDate: d.eventDate, reference: d.number },
        { entityType: "inquiry", entityId: d.inquiryId },
      )
    ).toLowerCase();
  }
  await logRun("inquiry.created", `${d.number} from ${d.name} — team notified, confirmation email: ${emailed.replace("_", " ")}`);
}

/** Client accepted online → pending booking + event + reservations, a planning task, team notified. */
export async function onQuoteAccepted(quotationId: string) {
  const found = await maybe<{ id: string; number: string; title: string; deposit: number; c: { name: string; email: string | null } }>(
    adminDb.from(tbl(schema.quotations)).select("id,number,title,deposit:deposit_amount,c:customers!inner(name,email)").eq("id", quotationId),
  );
  if (!found) return;
  const quote = { ...found, customer: found.c.name, email: found.c.email };
  const r = await rule("quote.accepted");
  let summary = `${quote.number} accepted by ${quote.customer}`;
  let href = `/admin/quotations/${quote.id}`;
  if (r && r.config.createBooking !== false) {
    try {
      const result = await bookingFromQuotation(adminDb, quotationId, null, "PENDING");
      if (result.event) {
        await exec(
          adminDb.from(tbl(schema.eventTasks)).insert(
            vals(schema.eventTasks, {
              eventId: result.event.id,
              title: `Confirm advance and kick off planning for ${quote.title}`,
              priority: "HIGH",
              dueAt: new Date(Date.now() + 2 * 86_400_000),
            }),
          ),
        );
      }
      href = `/admin/bookings/${result.booking.id}`;
      summary += " — pending booking, event and planning task created";
      if (result.shortages) {
        await notify({
          type: "inventory.shortage",
          title: `Inventory shortage for ${quote.title}`,
          body: result.shortages,
          href,
          priority: "URGENT",
          permission: "inventory.view",
        });
      }
    } catch (error) {
      summary += ` — booking not created (${error instanceof Error ? error.message : "error"})`;
    }
  }
  await notify({
    type: "quote.accepted",
    title: `${quote.customer} accepted ${quote.number}`,
    body: quote.title,
    href,
    priority: "HIGH",
    entityType: "quotation",
    entityId: quote.id,
    permission: "quotations.view",
    dedupeKey: `accepted:${quote.id}`,
  });
  await sendEmail(
    quote.email,
    "quotationAccepted",
    { name: quote.customer, number: quote.number, title: quote.title, deposit: quote.deposit },
    { entityType: "quotation", entityId: quote.id },
  );
  if (r) await logRun("quote.accepted", summary);
}

/** Events overlapping this one where the staff member is also assigned. */
export async function staffConflicts(staffId: string, eventId: string) {
  const event = await maybe<Row<typeof schema.events>>(adminDb.from(tbl(schema.events)).select(cols(schema.events)).eq("id", eventId));
  if (!event) return [];
  const rows = await many<{ e: { id: string; title: string; date: string } }>(
    adminDb
      .from(tbl(schema.staffAssignments))
      .select("e:events!inner(id,title,date:event_date)")
      .eq("staff_id", staffId)
      .neq("e.id", eventId)
      .neq("e.status", "CANCELLED")
      .lt("e.start_at", event.endAt.toISOString())
      .gt("e.end_at", event.startAt.toISOString()),
  );
  return rows.map((r) => r.e);
}

export async function onStaffAssigned(staffId: string, eventId: string) {
  const conflicts = await staffConflicts(staffId, eventId);
  if (!conflicts.length) return conflicts;
  if (await rule("staff.conflict")) {
    const person = await maybe<{ name: string }>(adminDb.from(tbl(schema.staff)).select("name").eq("id", staffId));
    await notify({
      type: "staff.conflict",
      title: `${person?.name ?? "A team member"} is double-booked`,
      body: `Also assigned to ${conflicts.map((c) => `${c.title} (${fmtDate(c.date)})`).join(", ")}.`,
      href: `/admin/events/${eventId}?tab=team`,
      priority: "HIGH",
      permission: "events.view",
      dedupeKey: `conflict:${staffId}:${[eventId, ...conflicts.map((c) => c.id)].sort().join(":")}`,
    });
    await logRun("staff.conflict", `${person?.name} overlaps ${conflicts.length} event(s)`);
  }
  return conflicts;
}

/* ───────── Daily sweep ───────── */

export async function runScheduledAutomations() {
  const today = todayISO();
  const results: string[] = [];

  // Quotations about to expire / expired
  const qe = await rule("quote.expiring");
  if (qe) {
    const days = Number(qe.config.daysBefore ?? 3);
    const expiring = (
      await all<{ id: string; number: string; validUntil: string | null; c: { name: string } }>(() =>
        adminDb
          .from(tbl(schema.quotations))
          .select("id,number,validUntil:valid_until,c:customers!inner(name)")
          .in("status", ["SENT", "VIEWED"])
          .is("deleted_at", null)
          .not("valid_until", "is", null)
          .lte("valid_until", todayISO(days))
          .order("id"),
      )
    ).map(({ c, ...q }) => ({ ...q, customer: c.name }));
    let expired = 0;
    for (const quote of expiring) {
      if (quote.validUntil! < today) {
        await exec(adminDb.from(tbl(schema.quotations)).update({ status: "EXPIRED" }).eq("id", quote.id));
        expired++;
      } else {
        await notify({
          type: "quote.expiring",
          title: `${quote.number} expires ${quote.validUntil === today ? "today" : fmtDate(quote.validUntil!)}`,
          body: `Quotation for ${quote.customer} — follow up before it lapses.`,
          href: `/admin/quotations/${quote.id}`,
          priority: "HIGH",
          permission: "quotations.view",
          dedupeKey: `expiring:${quote.id}`,
        });
      }
    }
    await logRun("quote.expiring", `${expiring.length - expired} expiring soon, ${expired} marked expired`);
    results.push("quote.expiring");
  }

  // Overdue invoices and booking payments
  if (await rule("payment.overdue")) {
    // Invoices past due become OVERDUE (the balance trigger re-evaluates status)
    const pastDue = await all<{ id: string; number: string; total: number; paid: number; due: string | null }>(() =>
      adminDb.from(tbl(schema.invoices)).select("id,number,total,paid:amount_paid,due:due_date").in("status", ["SENT", "PARTIALLY_PAID"]).lt("due_date", today).order("id"),
    );
    const overdueInvoices = pastDue.filter((inv) => inv.paid < inv.total);
    if (overdueInvoices.length) {
      await exec(
        adminDb
          .from(tbl(schema.invoices))
          .update({ status: "OVERDUE" })
          .in(
            "id",
            overdueInvoices.map((inv) => inv.id),
          ),
      );
    }
    for (const inv of overdueInvoices) {
      await notify({
        type: "invoice.overdue",
        title: `Invoice ${inv.number} is overdue`,
        body: `${npr(inv.total - inv.paid)} was due ${fmtDate(inv.due!)}.`,
        href: `/admin/invoices/${inv.id}`,
        priority: "URGENT",
        entityType: "invoice",
        entityId: inv.id,
        permission: "invoices.view",
        dedupeKey: `invoice-overdue:${inv.id}`,
      });
    }
    const candidates = await all<Row<typeof schema.bookings> & { c: { name: string } }>(() =>
      adminDb
        .from(tbl(schema.bookings))
        .select(`${cols(schema.bookings)},c:customers!inner(name)`)
        .neq("status", "CANCELLED")
        .or(`deposit_due_date.lt.${today},balance_due_date.lt.${today}`)
        .order("id"),
    );
    const late = candidates
      .filter(
        (b) =>
          (!!b.depositDueDate && b.depositDueDate < today && b.amountPaid < b.depositAmount) || (!!b.balanceDueDate && b.balanceDueDate < today && b.amountPaid < b.totalAmount),
      )
      .map(({ c, ...b }) => ({ b, customer: c.name }));
    for (const { b, customer } of late) {
      const depositLate = !!b.depositDueDate && b.depositDueDate < today && b.amountPaid < b.depositAmount;
      const owed = depositLate ? b.depositAmount - b.amountPaid : b.totalAmount - b.amountPaid;
      await notify({
        type: "payment.overdue",
        title: `Payment overdue: ${b.number} (${customer})`,
        body: `${npr(owed)} ${depositLate ? "advance" : "balance"} was due ${fmtDate((depositLate ? b.depositDueDate : b.balanceDueDate)!)}.`,
        href: `/admin/bookings/${b.id}?tab=payments`,
        priority: "URGENT",
        permission: "payments.view",
        dedupeKey: `overdue:${b.id}:${depositLate ? "deposit" : "balance"}`,
      });
    }
    await logRun("payment.overdue", `${overdueInvoices.length} invoice(s) now overdue, ${late.length} booking(s) behind on payments`);
    results.push("payment.overdue");
  }

  // Upcoming events
  const eu = await rule("event.upcoming");
  if (eu) {
    const days = Number(eu.config.daysBefore ?? 7);
    const soon = (
      await all<{ id: string; title: string; date: string; c: { name: string; email: string | null } | null }>(() =>
        adminDb
          .from(tbl(schema.events))
          .select("id,title,date:event_date,c:customers(name,email)")
          .not("status", "in", "(CANCELLED,COMPLETED)")
          .gte("event_date", today)
          .lte("event_date", todayISO(days))
          .order("id"),
      )
    ).map(({ c, ...ev }) => ({ ...ev, customer: c?.name ?? null, email: c?.email ?? null }));
    for (const ev of soon) {
      const left = Math.round((new Date(ev.date).getTime() - new Date(today).getTime()) / 86_400_000);
      await notify({
        type: "event.upcoming",
        title: `${ev.title} is ${left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}`,
        body: `${fmtDate(ev.date)} — check tasks, team and inventory.`,
        href: `/admin/events/${ev.id}`,
        priority: left <= 1 ? "HIGH" : "MEDIUM",
        entityType: "event",
        entityId: ev.id,
        permission: "events.view",
        dedupeKey: left <= 1 ? `upcoming-1:${ev.id}` : `upcoming:${ev.id}`,
      });
      if (eu.config.emailClient && ev.email && left === days) {
        await sendEmail(ev.email, "eventReminder", { name: ev.customer ?? "", title: ev.title, date: ev.date, days: left }, { entityType: "event", entityId: ev.id });
      }
    }
    await logRun("event.upcoming", `${soon.length} event(s) in the next ${days} days`);
    results.push("event.upcoming");
  }

  // Low stock
  if (await rule("inventory.low")) {
    const raised = await checkLowStock();
    await logRun("inventory.low", `${raised} item(s) below their threshold`);
    results.push("inventory.low");
  }

  // Overdue tasks
  if (await rule("task.overdue")) {
    const tasks = await all<{ id: string; title: string; eventId: string | null; userId: string | null; staffId: string | null }>(() =>
      adminDb
        .from(tbl(schema.eventTasks))
        .select("id,title,eventId:event_id,userId:assignee_user_id,staffId:assignee_staff_id")
        .neq("status", "COMPLETED")
        .lt("due_at", new Date().toISOString())
        .order("id"),
    );
    const linked = tasks.some((t) => t.staffId)
      ? await many<{ id: string; staffId: string | null }>(
          adminDb
            .from(tbl(schema.profiles))
            .select("id,staffId:staff_id")
            .in(
              "staff_id",
              tasks.map((t) => t.staffId).filter((x): x is string => !!x),
            ),
        )
      : [];
    for (const t of tasks) {
      await notify({
        type: "task.overdue",
        title: `Task overdue: ${t.title}`,
        href: t.eventId ? `/admin/events/${t.eventId}?tab=tasks` : "/admin/tasks",
        priority: "HIGH",
        permission: "events.view",
        userId: t.userId ?? linked.find((u) => u.staffId === t.staffId)?.id ?? null,
        dedupeKey: `task-overdue:${t.id}`,
      });
    }
    await logRun("task.overdue", `${tasks.length} overdue task(s)`);
    results.push("task.overdue");
  }

  // Follow-ups: mark overdue, remind today's
  const fr = await rule("followup.due");
  if (fr) {
    // Nepal calendar day boundaries
    const dayStart = new Date(`${today}T00:00:00+05:45`).toISOString();
    const dayEnd = new Date(`${todayISO(1)}T00:00:00+05:45`).toISOString();
    const overdue = await many<{ id: string; assignedTo: string | null; leadId: string | null }>(
      adminDb.from(tbl(schema.followups)).update({ status: "OVERDUE" }).eq("status", "PENDING").lt("due_at", dayStart).select("id,assignedTo:assigned_to,leadId:lead_id"),
    );
    for (const f of overdue) {
      await notify({
        type: "followup.overdue",
        title: "A follow-up is overdue",
        href: f.leadId ? `/admin/leads/${f.leadId}` : "/admin/follow-ups",
        priority: "HIGH",
        permission: "leads.view",
        userId: f.assignedTo,
        dedupeKey: `followup-overdue:${f.id}`,
      });
    }
    const due = (
      await all<{ id: string; assignedTo: string | null; type: string; lead: { id: string; name: string } | null }>(() =>
        adminDb
          .from(tbl(schema.followups))
          .select("id,assignedTo:assigned_to,type,lead:leads(id,name)")
          .eq("status", "PENDING")
          .gte("due_at", dayStart)
          .lt("due_at", dayEnd)
          .order("id"),
      )
    ).map(({ lead, ...f }) => ({ ...f, leadName: lead?.name ?? null, leadId: lead?.id ?? null }));
    for (const f of due) {
      await notify({
        type: "followup.due",
        title: `Follow up with ${f.leadName ?? "a customer"} today (${f.type.toLowerCase()})`,
        href: f.leadId ? `/admin/leads/${f.leadId}` : "/admin/follow-ups",
        permission: "leads.view",
        userId: f.assignedTo,
        dedupeKey: `followup:${f.id}:${today}`,
      });
    }
    if (fr.config.email) {
      const byUser = new Map<string, number>();
      for (const f of due) if (f.assignedTo) byUser.set(f.assignedTo, (byUser.get(f.assignedTo) ?? 0) + 1);
      for (const [userId, count] of byUser) {
        const u = await maybe<{ email: string; name: string }>(adminDb.from(tbl(schema.profiles)).select("email,name:full_name").eq("id", userId));
        if (u) await sendEmail(u.email, "followUpReminder", { staff: u.name || u.email, count });
      }
    }
    await logRun("followup.due", `${due.length} due today, ${overdue.length} newly overdue`);
    results.push("followup.due");
  }

  // Vendor payments due
  if (await rule("vendor.payment_due")) {
    const due = (
      await all<{ id: string; cost: number; service: string; dueDate: string | null; v: { name: string } }>(() =>
        adminDb.from(tbl(schema.vendorAssignments)).select("id,cost,service,dueDate:due_date,v:vendors!inner(name)").neq("status", "CANCELLED").lte("due_date", today).order("id"),
      )
    ).map(({ v, ...d }) => ({ ...d, vendor: v.name }));
    const paid = await vendorPaid(due.map((d) => d.id));
    let count = 0;
    for (const d of due) {
      const owed = d.cost - (paid.get(d.id) ?? 0);
      if (owed <= 0) continue;
      count++;
      await notify({
        type: "vendor.payment_due",
        title: `Vendor payment due: ${d.vendor}`,
        body: `${npr(owed)} for ${d.service} (due ${fmtDate(d.dueDate!)}).`,
        href: "/admin/vendors?tab=payments",
        priority: "HIGH",
        permission: "expenses.view",
        dedupeKey: `vendor-due:${d.id}`,
      });
    }
    await logRun("vendor.payment_due", `${count} vendor payment(s) due`);
    results.push("vendor.payment_due");
  }

  await markSweep();
  return results;
}

const markSweep = () => exec(adminDb.from(tbl(schema.siteSettings)).upsert({ key: "automation_last_sweep", value: { at: new Date().toISOString() } }, { onConflict: "key" }));

/** Run the sweep if it hasn't run in the last hour (fallback when no cron is configured). */
export async function maybeRunSweep() {
  const row = await maybe<{ value: unknown }>(adminDb.from(tbl(schema.siteSettings)).select("value").eq("key", "automation_last_sweep"));
  const last = row ? new Date((row.value as { at: string }).at).getTime() : 0;
  if (Date.now() - last < 3_600_000) return false;
  // Claim the slot first so concurrent dashboard loads don't run it twice
  await markSweep();
  await runScheduledAutomations();
  return true;
}
