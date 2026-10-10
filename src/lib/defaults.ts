/** Built-in records created by the seed: automation rules and reusable checklists. */

export type RuleKey =
  | "inquiry.created"
  | "quote.accepted"
  | "quote.expiring"
  | "payment.overdue"
  | "event.upcoming"
  | "inventory.low"
  | "task.overdue"
  | "followup.due"
  | "vendor.payment_due"
  | "staff.conflict";

export const DEFAULT_RULES: { key: RuleKey; name: string; trigger: string; description: string; config: Record<string, number | boolean> }[] = [
  {
    key: "inquiry.created",
    name: "New website inquiry",
    trigger: "When a visitor submits the inquiry form",
    description: "Create a lead (and link or create the client), notify the sales team, and email the visitor a confirmation if they gave an email.",
    config: { sendConfirmation: true },
  },
  {
    key: "quote.accepted",
    name: "Quotation accepted",
    trigger: "When a client accepts a quotation online",
    description: "Create a pending booking with its event workspace and inventory reservation from the quotation, add a planning task, move the lead to Confirmed and notify the team.",
    config: { createBooking: true },
  },
  {
    key: "quote.expiring",
    name: "Quotation expiring",
    trigger: "Daily — quotations close to their valid-until date",
    description: "Warn the team a few days before a sent quotation expires, and mark it expired once the date has passed.",
    config: { daysBefore: 3 },
  },
  {
    key: "payment.overdue",
    name: "Payment overdue",
    trigger: "Daily — bookings past their balance or advance due date",
    description: "Raise a notification for every booking with money still owed after its due date.",
    config: {},
  },
  {
    key: "event.upcoming",
    name: "Upcoming event reminder",
    trigger: "Daily — events coming up soon",
    description: "Remind the team (and optionally email the client) a set number of days before each event.",
    config: { daysBefore: 7, emailClient: false },
  },
  {
    key: "inventory.low",
    name: "Low stock alert",
    trigger: "Whenever stock changes, and daily",
    description: "Alert the inventory team when an item's available quantity falls below its minimum.",
    config: {},
  },
  {
    key: "task.overdue",
    name: "Task overdue",
    trigger: "Daily — tasks past their due date",
    description: "Notify the team about tasks that are past due and not done.",
    config: {},
  },
  {
    key: "followup.due",
    name: "Follow-up reminder",
    trigger: "Daily — follow-ups due today",
    description: "Remind the assigned person about today's follow-ups (and email them if email is set up).",
    config: { email: false },
  },
  {
    key: "vendor.payment_due",
    name: "Vendor payment due",
    trigger: "Daily — vendor bookings past their due date",
    description: "Flag vendor bookings that are due and not fully paid.",
    config: {},
  },
  {
    key: "staff.conflict",
    name: "Staff double-booking",
    trigger: "When someone is assigned to an event",
    description: "Warn when a team member is assigned to events whose setup windows overlap.",
    config: {},
  },
];

export const DEFAULT_CHECKLISTS: { name: string; phase: "PRE" | "POST"; items: string[] }[] = [
  {
    name: "Standard pre-event",
    phase: "PRE",
    items: [
      "Confirm venue access and setup time",
      "Confirm client requirements and final design",
      "Prepare flowers",
      "Prepare backdrop",
      "Check lighting",
      "Load vehicle",
      "Confirm staff",
      "Confirm vendors",
    ],
  },
  {
    name: "Standard post-event",
    phase: "POST",
    items: ["Dismantle décor", "Return rental items", "Inventory check", "Damage inspection", "Client follow-up", "Upload photos"],
  },
];

/** Default quotation terms (editable in Settings → Quotations). */
export const DEFAULT_QUOTE_TERMS = `1. An advance is required to confirm the booking; the date is held only once the advance is received.
2. The remaining balance is due on or before the event date unless agreed otherwise in writing.
3. Prices include setup and dismantling within Kathmandu Valley. Venues outside the valley may incur transport charges.
4. Fresh flowers are seasonal; similar varieties may be substituted while keeping the agreed look and colours.
5. Changes to the design after confirmation may change the price and will be quoted separately.
6. Cancellations within 14 days of the event forfeit the advance.
7. The client is responsible for damage to rented décor caused by guests or the venue.`;

