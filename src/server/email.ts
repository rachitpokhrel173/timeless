import "server-only";
import { adminDb, exec, schema, tbl, vals } from "@/db";
import { getSiteSettings } from "@/lib/content";
import { fmtDateLong, npr } from "@/lib/format";
import { resolveSiteUrl } from "@/lib/site-url";

/*
 * Transactional email templates, sent through Resend when RESEND_API_KEY and EMAIL_FROM are set
 * (EMAIL_FROM must be an address on a domain verified in Resend). Without them nothing is sent and
 * each message is recorded as "not configured", so the admin can see exactly what would have gone
 * out. Every attempt lands in the outbox. (Sign-in, invite and password-reset emails are sent by
 * Supabase Auth itself.)
 */

type Rendered = { subject: string; html: string; text: string };
type Brand = Awaited<ReturnType<typeof getSiteSettings>>;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** One shared, brand-styled layout for every email. */
function layout(brand: Brand, heading: string, paragraphs: string[], cta?: { label: string; href: string }, footnote?: string) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.6">${esc(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${esc(cta.href)}" style="background:#3d5245;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;display:inline-block;font-weight:600">${esc(cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f3ec;font-family:Helvetica,Arial,sans-serif;color:#24201d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e3dbcf;border-radius:10px">
<tr><td style="padding:26px 28px 6px;border-bottom:1px solid #efe7dc">
<div style="font-family:Georgia,serif;font-size:22px;color:#641a35">${esc(brand.name)}</div>
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7a5f36;margin-top:4px">${esc(brand.tagline)}</div></td></tr>
<tr><td style="padding:24px 28px 10px"><h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 16px">${esc(heading)}</h1>${body}${button}
${footnote ? `<p style="font-size:12px;color:#6b625a;line-height:1.5">${esc(footnote)}</p>` : ""}</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12px;color:#6b625a;border-top:1px solid #efe7dc">
${esc(brand.address.street)}, ${esc(brand.address.city)} · ${esc(brand.phones.map((p) => p.label).join(" / "))} · ${esc(brand.email)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [heading, "", ...paragraphs, cta ? `\n${cta.label}: ${cta.href}` : "", footnote ?? "", "", `${brand.name} · ${brand.phones[0]?.label ?? ""} · ${brand.email}`].join(
    "\n",
  );
  return { html, text };
}

const siteUrl = () => resolveSiteUrl();

/** Every template in one place. */
export const templates = {
  inquiryConfirmation: (b: Brand, d: { name: string; eventType: string; eventDate?: string | null; reference?: string }): Rendered => ({
    subject: `We received your inquiry${d.reference ? ` (${d.reference})` : ""} — ${b.shortName}`,
    ...layout(b, `Thank you, ${d.name.split(" ")[0]}!`, [
      `We've received your inquiry for your ${d.eventType.replace(/-/g, " ")}${d.eventDate ? ` on ${fmtDateLong(d.eventDate)}` : ""}.${d.reference ? ` Your reference is ${d.reference}.` : ""}`,
      "Someone from our team will contact you shortly to talk through your ideas. If it's urgent, call or WhatsApp us any time.",
    ]),
  }),
  quotationSent: (b: Brand, d: { name: string; number: string; title: string; total: number; validUntil?: string | null; token: string }): Rendered => ({
    subject: `Your quotation ${d.number} from ${b.shortName}`,
    ...layout(
      b,
      `Your quotation is ready`,
      [
        `Hi ${d.name.split(" ")[0]}, here is our quotation for ${d.title}.`,
        `Total: ${npr(d.total)}${d.validUntil ? ` · valid until ${fmtDateLong(d.validUntil)}` : ""}.`,
        "You can review it, download a PDF, accept it or ask for changes using the button below.",
      ],
      { label: "View quotation", href: `${siteUrl()}/quote/${d.token}` },
      "This link is personal to you — please don't share it.",
    ),
  }),
  quotationAccepted: (b: Brand, d: { name: string; number: string; title: string; deposit: number }): Rendered => ({
    subject: `Thank you — ${d.number} accepted`,
    ...layout(b, "We're delighted to be part of your celebration", [
      `Hi ${d.name.split(" ")[0]}, thank you for accepting quotation ${d.number} for ${d.title}.`,
      d.deposit > 0 ? `To confirm your date, an advance of ${npr(d.deposit)} is due. We'll be in touch with payment details.` : "We'll be in touch shortly with next steps.",
    ]),
  }),
  bookingConfirmation: (b: Brand, d: { name: string; number: string; title: string; date: string; venue?: string | null; portalUrl?: string | null }): Rendered => ({
    subject: `Booking confirmed — ${d.title}`,
    ...layout(
      b,
      "Your booking is confirmed",
      [
        `Hi ${d.name.split(" ")[0]}, your booking ${d.number} for ${d.title} on ${fmtDateLong(d.date)}${d.venue ? ` at ${d.venue}` : ""} is confirmed.`,
        "We'll share the schedule and designs as planning progresses.",
      ],
      d.portalUrl ? { label: "Open your event page", href: d.portalUrl } : undefined,
    ),
  }),
  paymentReceipt: (b: Brand, d: { name: string; receipt: string; amount: number; balance: number; title: string }): Rendered => ({
    subject: `Payment received — ${d.receipt}`,
    ...layout(b, "Thank you for your payment", [
      `Hi ${d.name.split(" ")[0]}, we've received ${npr(d.amount)} for ${d.title} (receipt ${d.receipt}).`,
      d.balance > 0 ? `Remaining balance: ${npr(d.balance)}.` : "Your booking is now fully paid.",
    ]),
  }),
  eventReminder: (b: Brand, d: { name: string; title: string; date: string; days: number }): Rendered => ({
    subject: `${d.days} days to go — ${d.title}`,
    ...layout(b, "Your celebration is almost here", [
      `Hi ${d.name.split(" ")[0]}, just a reminder that ${d.title} is on ${fmtDateLong(d.date)}.`,
      "If anything has changed — timings, guest numbers, venue access — please let us know as soon as possible.",
    ]),
  }),
  followUpReminder: (b: Brand, d: { staff: string; count: number }): Rendered => ({
    subject: `You have ${d.count} follow-up${d.count === 1 ? "" : "s"} today`,
    ...layout(b, "Today's follow-ups", [`Hi ${d.staff.split(" ")[0]}, you have ${d.count} follow-up${d.count === 1 ? "" : "s"} due today.`], {
      label: "Open follow-ups",
      href: `${siteUrl()}/admin/follow-ups`,
    }),
  }),
};

export type TemplateName = keyof typeof templates;

/** True when emails are actually sent (Resend is set up), not just recorded. */
export const emailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

/** Send one message through Resend's HTTP API. */
async function deliver(to: string, rendered: Rendered, replyTo: string | undefined): Promise<{ status: "SENT" | "FAILED" | "NOT_CONFIGURED"; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { status: "NOT_CONFIGURED" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: rendered.subject, html: rendered.html, text: rendered.text, ...(replyTo && { reply_to: replyTo }) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { status: "SENT" };
    return { status: "FAILED", error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
  } catch (e) {
    return { status: "FAILED", error: e instanceof Error ? e.message : "Network error" };
  }
}

/** Render a template, send it (when a provider is configured) and record it in the outbox. Never throws. */
export async function sendEmail<T extends TemplateName>(
  to: string | null | undefined,
  template: T,
  data: Parameters<(typeof templates)[T]>[1],
  ref?: { entityType: string; entityId: string },
): Promise<"SENT" | "FAILED" | "NOT_CONFIGURED" | "NO_RECIPIENT"> {
  if (!to) return "NO_RECIPIENT";
  const brand = await getSiteSettings();
  const rendered = (templates[template] as (b: Brand, d: typeof data) => Rendered)(brand, data);
  const { status, error } = await deliver(to, rendered, process.env.EMAIL_REPLY_TO || brand.email || undefined);
  if (error) console.error(`[email] ${template} to ${to} failed:`, error);
  await exec(
    adminDb
      .from(tbl(schema.emailOutbox))
      .insert(vals(schema.emailOutbox, { to, template, subject: rendered.subject, status, error: error ?? null, entityType: ref?.entityType, entityId: ref?.entityId })),
  ).catch((e) => console.error("[email] outbox write failed", e));
  return status;
}

/** For the template preview screen in Settings. */
export async function previewTemplate(name: TemplateName) {
  const brand = await getSiteSettings();
  const sample = {
    inquiryConfirmation: { name: "Anil Sharma", eventType: "wedding", eventDate: "2026-10-12", reference: "IQ-2026-001" },
    quotationSent: { name: "Anil Sharma", number: "QT-2026-001", title: "Priya & Anil Wedding", total: 485000, validUntil: "2026-10-20", token: "preview" },
    quotationAccepted: { name: "Anil Sharma", number: "QT-2026-001", title: "Priya & Anil Wedding", deposit: 242500 },
    bookingConfirmation: { name: "Anil Sharma", number: "BK-2026-001", title: "Priya & Anil Wedding", date: "2026-10-12", venue: "Hotel Shanker" },
    paymentReceipt: { name: "Anil Sharma", receipt: "RC-2026-001", amount: 100000, balance: 150000, title: "Priya & Anil Wedding" },
    eventReminder: { name: "Anil Sharma", title: "Priya & Anil Wedding", date: "2026-10-12", days: 7 },
    followUpReminder: { staff: "Sita Karki", count: 3 },
  }[name];
  return (templates[name] as (b: Brand, d: unknown) => Rendered)(brand, sample);
}
