/** Built-in records created by the seed: automation rules and reusable checklists. */

export type RuleKey =
  | "inquiry.created"
  | "quote.accepted"
  | "quote.expiring"
  | "payment.overdue"
  | "payment.reminder"
  | "event.upcoming"
  | "inventory.low"
  | "task.overdue"
  | "followup.due"
  | "vendor.payment_due"
  | "staff.conflict"
  | "event.workplan"
  | "task.progress"
  | "task.digest";

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
    key: "payment.reminder",
    name: "Payment reminder to clients",
    trigger: "Daily — advances and balances coming due",
    description:
      "Email the client a few days before their advance or balance is due, and once more if it becomes overdue (within a week). Each reminder is sent once; clients without an email are skipped.",
    config: { daysBefore: 3, overdueReminder: true },
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
  {
    key: "event.workplan",
    name: "Work plan for new events",
    trigger: "When a booking creates an event, and when someone joins the event team",
    description:
      "Add the matching work plan (Settings → Work plans) to the event as dated tasks — pack, set up, decorate, dismantle — and hand each task to the team member whose role matches it. The team gets a notification for their work.",
    config: { autoAssign: true },
  },
  {
    key: "task.progress",
    name: "Work progress",
    trigger: "When the team starts, finishes or gets stuck on a task",
    description:
      "Tell the planners who finished what (and who is blocked). The first work-plan task started moves a confirmed booking to In progress; when every task is done the event is marked Completed.",
    config: { autoStart: true, autoComplete: true },
  },
  {
    key: "task.digest",
    name: "Morning work summary",
    trigger: "Daily — every morning",
    description: "Send each team member a summary of today's events and tasks, plus anything overdue.",
    config: {},
  },
];

export const TEAM_ROLES = ["Lead decorator", "Decorator", "Florist", "Lighting", "Crew", "Driver", "Store keeper", "Planner"];

export type WorkStep = { day: number; time: string; title: string; role: string | null; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; details: string | null };
export type WorkPlan = { id: string; name: string; eventTypes: string[]; steps: WorkStep[] };

/** Used until a work plan is saved in Settings → Work plans. Days are relative to the event day (0). */
export const DEFAULT_WORK_PLANS: WorkPlan[] = [
  {
    id: "standard",
    name: "Standard decoration",
    eventTypes: [],
    steps: [
      { day: -3, time: "11:00", title: "Confirm final design, colours and item list with the client", role: "Planner", priority: "HIGH", details: null },
      { day: -2, time: "11:00", title: "Order fresh flowers and confirm vendors", role: "Planner", priority: "MEDIUM", details: null },
      { day: -1, time: "10:00", title: "Check and clean décor items from the store", role: "Store keeper", priority: "MEDIUM", details: null },
      { day: -1, time: "15:00", title: "Pack décor and load the vehicle", role: "Crew", priority: "HIGH", details: "Tick items off the event day sheet while loading." },
      { day: 0, time: "07:00", title: "Unload at the venue and set up structures", role: "Crew", priority: "HIGH", details: null },
      { day: 0, time: "09:00", title: "Stage and backdrop decoration", role: "Lead decorator", priority: "URGENT", details: null },
      { day: 0, time: "11:00", title: "Flowers, entrance and table décor", role: "Decorator", priority: "HIGH", details: null },
      { day: 0, time: "13:00", title: "Lighting setup and test", role: "Lighting", priority: "HIGH", details: null },
      { day: 0, time: "15:30", title: "Final walkthrough and photos before guests arrive", role: "Lead decorator", priority: "URGENT", details: "Upload photos of the finished décor." },
      { day: 1, time: "09:00", title: "Dismantle and pack everything", role: "Crew", priority: "HIGH", details: null },
      { day: 1, time: "14:00", title: "Return items to the store and report damage or losses", role: "Store keeper", priority: "MEDIUM", details: null },
    ],
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

