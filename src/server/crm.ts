import "server-only";
import { adminDb, cols, exec, likeEscape, many, maybe, one, pgrstValue, schema, tbl, vals, type DB, type Row } from "@/db";
import { UserError } from "@/lib/actions";
import { nextNumber } from "./numbering";

type Actor = { id: string; name: string } | null;
type Conn = DB;
type Customer = Row<typeof schema.customers>;
type Lead = Row<typeof schema.leads>;

export const LEAD_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "QUOTED", "NEGOTIATION", "CONFIRMED", "COMPLETED", "LOST"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const INQUIRY_STATUSES = schema.inquiryStatus.enumValues;

/** Last 10 digits — matches "+977 984-5411029" with "9845411029". */
export const phoneKey = (phone?: string | null) => (phone ? phone.replace(/\D/g, "").slice(-10) : "");

/** Find an existing customer by phone or email so repeat customers keep one history. */
export async function findCustomer(conn: Conn, phone?: string | null, email?: string | null) {
  const key = phoneKey(phone);
  if (key.length < 7 && !email) return null;
  // Narrow on the server (digits in order, any formatting between), then match exactly here
  const filters: string[] = [];
  if (key.length >= 7) filters.push(`phone.ilike.${pgrstValue(`%${key.split("").join("%")}`)}`);
  if (email) filters.push(`email.ilike.${pgrstValue(likeEscape(email))}`);
  const candidates = await many<Customer>(
    conn.from(tbl(schema.customers)).select(cols(schema.customers)).is("deleted_at", null).or(filters.join(",")).order("created_at").limit(200),
  );
  return candidates.find((c) => (key.length >= 7 && phoneKey(c.phone) === key) || (!!email && c.email?.toLowerCase() === email.toLowerCase())) ?? null;
}

export function sourceFromUtm(utm?: Record<string, string> | null, referrer?: string | null) {
  const s = `${utm?.utm_source ?? ""} ${referrer ?? ""}`.toLowerCase();
  if (s.includes("facebook") || s.includes("fb.")) return "FACEBOOK";
  if (s.includes("instagram")) return "INSTAGRAM";
  if (s.includes("tiktok")) return "TIKTOK";
  if (s.includes("google")) return "GOOGLE";
  if (s.includes("whatsapp") || s.includes("wa.me")) return "WHATSAPP";
  return "WEBSITE";
}

/** Append to a lead's activity history. */
export async function logLeadActivity(
  conn: Conn,
  leadId: string,
  type: (typeof schema.activityType.enumValues)[number],
  body: string,
  actorId?: string | null,
  metadata?: Record<string, unknown>,
) {
  await exec(
    conn.from(tbl(schema.leadActivities)).insert(
      vals(schema.leadActivities, {
        leadId,
        type,
        body,
        actorId: actorId ?? null,
        metadata,
      }),
    ),
  );
}

export type InquiryIntake = {
  kind: "INQUIRY" | "BOOKING_REQUEST";
  name: string;
  phone: string;
  email?: string | null;
  eventType: string;
  eventDate?: string | null;
  venue?: string | null;
  guestCount?: string | null;
  budget?: string | null;
  packageId?: string | null;
  preferredContact?: string | null;
  services: string[];
  designs: string[];
  theme?: string | null;
  message?: string | null;
  inspirationLinks: string[];
  utm?: Record<string, string> | null;
  referrer?: string | null;
  landingPage?: string | null;
  device?: string | null;
  ipHash?: string | null;
};

/**
 * Public website submission → customer (matched or new) → lead on the pipeline → inquiry with
 * a reference number. Uses the service-role client: the public form is validated and
 * rate-limited by the server before it gets here.
 */
export async function createInquiry(input: InquiryIntake) {
  const conn = adminDb;
  const sourceKey = sourceFromUtm(input.utm, input.referrer);
  const campaign = input.utm?.utm_campaign ? await maybe<{ id: string }>(conn.from(tbl(schema.campaigns)).select("id").eq("utm_campaign", input.utm.utm_campaign).limit(1)) : null;
  let customer = await findCustomer(conn, input.phone, input.email);
  if (!customer) {
    customer = await one<Customer>(
      conn
        .from(tbl(schema.customers))
        .insert(
          vals(schema.customers, {
            name: input.name,
            phone: input.phone,
            email: input.email,
            sourceKey,
          }),
        )
        .select(cols(schema.customers)),
    );
  } else if (!customer.email && input.email) {
    await exec(conn.from(tbl(schema.customers)).update({ email: input.email }).eq("id", customer.id));
  }
  const lead = await one<Lead>(
    conn
      .from(tbl(schema.leads))
      .insert(
        vals(schema.leads, {
          number: await nextNumber("LD", conn),
          customerId: customer.id,
          name: input.name,
          email: input.email,
          phone: input.phone,
          eventType: input.eventType,
          eventDate: input.eventDate,
          location: input.venue,
          guestCount: input.guestCount,
          budget: input.budget,
          sourceKey,
          campaignId: campaign?.id,
          stage: "NEW",
          priority: input.kind === "BOOKING_REQUEST" ? "HIGH" : "MEDIUM",
          position: -(Date.now() % 1_000_000_000),
        }),
      )
      .select(cols(schema.leads)),
  );
  const { kind, ...fields } = input;
  const inquiry = await one<Row<typeof schema.inquiries>>(
    conn
      .from(tbl(schema.inquiries))
      .insert(
        vals(schema.inquiries, {
          ...fields,
          kind,
          number: await nextNumber("IQ", conn),
          leadId: lead.id,
          customerId: customer.id,
          sourceKey,
        }),
      )
      .select(cols(schema.inquiries)),
  );
  await logLeadActivity(conn, lead.id, "SYSTEM", `${kind === "BOOKING_REQUEST" ? "Booking request" : "Inquiry"} ${inquiry.number} received from the website`);
  return { inquiry, lead, customer };
}

/** Create a lead by hand (phone call, walk-in…), linking the existing customer when there is one. */
export async function createLead(
  conn: Conn,
  data: {
    name: string;
    phone?: string | null;
    email?: string | null;
    eventType?: string | null;
    eventDate?: string | null;
    location?: string | null;
    guestCount?: string | null;
    budget?: string | null;
    sourceKey: string;
    priority: (typeof schema.priority.enumValues)[number];
    assignedTo?: string | null;
    campaignId?: string | null;
    customerId?: string | null;
  },
  actor: Actor,
) {
  const customerId = data.customerId ?? (await findCustomer(conn, data.phone, data.email))?.id ?? null;
  const lead = await one<Lead>(
    conn
      .from(tbl(schema.leads))
      .insert(
        vals(schema.leads, {
          ...data,
          customerId,
          number: await nextNumber("LD", conn),
          position: -(Date.now() % 1_000_000_000),
        }),
      )
      .select(cols(schema.leads)),
  );
  await logLeadActivity(conn, lead.id, "SYSTEM", `Lead created by ${actor?.name ?? "the system"}`, actor?.id);
  return lead;
}

export const getLead = (conn: Conn, leadId: string) => maybe<Lead>(conn.from(tbl(schema.leads)).select(cols(schema.leads)).eq("id", leadId));

/** Make sure the lead has a customer record (before quoting / converting). Returns the customer id. */
export async function ensureCustomerForLead(conn: Conn, leadId: string, actor: Actor) {
  const lead = await getLead(conn, leadId);
  if (!lead) throw new UserError("Lead not found.");
  if (lead.customerId) return lead.customerId;
  const existing = await findCustomer(conn, lead.phone, lead.email);
  const customerId =
    existing?.id ??
    (
      await one<{ id: string }>(
        conn
          .from(tbl(schema.customers))
          .insert(
            vals(schema.customers, {
              name: lead.name,
              phone: lead.phone,
              email: lead.email,
              sourceKey: lead.sourceKey,
            }),
          )
          .select("id"),
      )
    ).id;
  await exec(conn.from(tbl(schema.leads)).update({ customer_id: customerId }).eq("id", leadId));
  await logLeadActivity(conn, leadId, "SYSTEM", existing ? "Linked to existing customer" : "Converted to customer", actor?.id, { customerId });
  return customerId;
}

/** Move a lead on the pipeline board; positions are re-packed within the target stage. */
export async function moveLead(conn: Conn, leadId: string, stage: LeadStage, beforeId: string | null, actor: Actor, lostReason?: string | null) {
  const lead = await getLead(conn, leadId);
  if (!lead) throw new UserError("Lead not found.");
  const column = await many<{ id: string }>(
    conn.from(tbl(schema.leads)).select("id").eq("stage", stage).is("deleted_at", null).is("archived_at", null).order("position").order("created_at"),
  );
  const ids = column.map((c) => c.id).filter((id) => id !== leadId);
  const at = beforeId ? ids.indexOf(beforeId) : -1;
  ids.splice(at === -1 ? ids.length : at, 0, leadId);
  await Promise.all(ids.map((id, index) => exec(conn.from(tbl(schema.leads)).update({ position: index }).eq("id", id))));
  const contacted = lead.stage === "NEW" && stage !== "NEW" && stage !== "LOST";
  await exec(
    conn
      .from(tbl(schema.leads))
      .update(
        vals(schema.leads, {
          stage,
          lostReason: stage === "LOST" ? (lostReason ?? lead.lostReason) : null,
          lastContactAt: contacted ? new Date() : lead.lastContactAt,
        }),
      )
      .eq("id", leadId),
  );
  if (lead.stage !== stage) {
    await logLeadActivity(conn, leadId, "STAGE_CHANGE", `Moved from ${lead.stage} to ${stage}${stage === "LOST" && lostReason ? ` — ${lostReason}` : ""}`, actor?.id, {
      from: lead.stage,
      to: stage,
    });
  }
  return { from: lead.stage, to: stage, lead };
}

/** Advance a lead's stage forward only (used by quote/booking automations). */
export async function advanceLead(conn: Conn, leadId: string | null, stage: LeadStage, actor: Actor, note: string) {
  if (!leadId) return;
  const lead = await maybe<{ stage: string }>(conn.from(tbl(schema.leads)).select("stage").eq("id", leadId));
  if (!lead || lead.stage === "LOST") return;
  if (LEAD_STAGES.indexOf(stage) <= LEAD_STAGES.indexOf(lead.stage as LeadStage)) return;
  await exec(conn.from(tbl(schema.leads)).update({ stage, last_contact_at: new Date().toISOString() }).eq("id", leadId));
  await logLeadActivity(conn, leadId, "STAGE_CHANGE", note, actor?.id, {
    from: lead.stage,
    to: stage,
  });
}

/** Keep the lead's "next follow-up" in step with its open follow-ups. */
export async function syncNextFollowup(conn: Conn, leadId: string | null) {
  if (!leadId) return;
  const next = await maybe<{ dueAt: Date }>(
    conn.from(tbl(schema.followups)).select("dueAt:due_at").eq("lead_id", leadId).in("status", ["PENDING", "OVERDUE"]).order("due_at").limit(1),
  );
  await exec(
    conn
      .from(tbl(schema.leads))
      .update({ next_followup_at: next?.dueAt.toISOString() ?? null })
      .eq("id", leadId),
  );
}

export async function completeFollowup(conn: Conn, id: string, outcome: string | null, actor: Actor) {
  const f = await maybe<Row<typeof schema.followups>>(
    conn
      .from(tbl(schema.followups))
      .update(
        vals(schema.followups, {
          status: "COMPLETED",
          completedAt: new Date(),
          outcome,
        }),
      )
      .eq("id", id)
      .in("status", ["PENDING", "OVERDUE"])
      .select(cols(schema.followups)),
  );
  if (!f) throw new UserError("This follow-up is already complete.");
  if (f.leadId) {
    await exec(conn.from(tbl(schema.leads)).update({ last_contact_at: new Date().toISOString() }).eq("id", f.leadId));
    await syncNextFollowup(conn, f.leadId);
    const typeName = f.type.charAt(0) + f.type.slice(1).toLowerCase();
    await logLeadActivity(conn, f.leadId, f.type === "OTHER" ? "NOTE" : f.type, `${typeName} follow-up done${outcome ? `: ${outcome}` : ""}`, actor?.id);
  }
  return f;
}

export type { Actor };
