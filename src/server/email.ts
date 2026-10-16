import "server-only";
import { adminDb, exec, schema, tbl, vals } from "@/db";
import { getSiteSettings } from "@/lib/content";
import { fmtDateLong, npr } from "@/lib/format";
import { PRODUCTION_ORIGIN, resolveSiteUrl } from "@/lib/site-url";

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

const C = { wine: "#641a35", gold: "#a8834a", ink: "#24201d", muted: "#6b625a", line: "#ece4d8", cream: "#f7f3ec", card: "#fbf8f3" };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "Helvetica,Arial,sans-serif";

type Mail = {
  /** Inbox preview line shown after the subject. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** Summary card, e.g. quotation number, event and total. A `strong` row is highlighted. */
  details?: { label: string; value: string; strong?: boolean }[];
  cta?: { label: string; href: string };
  footnote?: string;
  /** Sign off as the team (client emails); off for internal staff emails. */
  signOff?: boolean;
};

/** Links in emails always point at the live site: a localhost link is useless to a client, even when sent while testing locally. */
const siteUrl = () => {
  const origin = resolveSiteUrl();
  return /localhost|127\.0\.0\.1/.test(origin) ? PRODUCTION_ORIGIN : origin;
};
const first = (name: string) => name.split(" ")[0];

/** Email clients need absolute image URLs. */
const absolute = (src: string) => (/^https?:\/\//.test(src) ? src : `${siteUrl()}${src.startsWith("/") ? "" : "/"}${src}`);

/** One shared, brand-styled layout for every email. */
function layout(brand: Brand, m: Mail) {
  const body = m.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${C.ink}">${esc(p)}</p>`).join("");

  const row = (d: NonNullable<Mail["details"]>[number], i: number) => {
    const sep = i ? `border-top:1px solid ${C.line};` : "";
    const value = d.strong ? `font-family:${SERIF};font-size:19px;color:${C.wine};font-weight:bold` : `font-size:14px;color:${C.ink};font-weight:600`;
    return `<tr><td style="padding:12px 18px;${sep}font-size:13px;color:${C.muted}">${esc(d.label)}</td><td align="right" style="padding:12px 18px;${sep}${value}">${esc(d.value)}</td></tr>`;
  };
  const details = m.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;background:${C.card};border:1px solid ${C.line};border-radius:8px">${m.details.map(row).join("")}</table>`
    : "";

  const button = m.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 12px"><tr><td style="background:${C.wine};border-radius:999px">
<a href="${esc(m.cta.href)}" style="display:inline-block;padding:14px 32px;font-family:${SANS};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:.3px">${esc(m.cta.label)} &rarr;</a></td></tr></table>
<p style="margin:0 0 20px;font-size:12px;line-height:1.5;color:${C.muted}">Button not working? Open this link:<br><a href="${esc(m.cta.href)}" style="color:${C.wine};word-break:break-all">${esc(m.cta.href)}</a></p>`
    : "";

  const footnote = m.footnote
    ? `<p style="margin:0 0 18px;padding:10px 14px;background:${C.cream};border-left:3px solid ${C.gold};font-size:12.5px;line-height:1.5;color:${C.muted}">${esc(m.footnote)}</p>`
    : "";

  const signOff = m.signOff
    ? `<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:${C.ink}">Warm regards,<br><span style="font-family:${SERIF};font-size:17px;color:${C.wine}">The ${esc(brand.shortName)} team</span></p>`
    : "";

  const logo = brand.logo ? `<img src="${esc(absolute(brand.logo.src))}" width="64" alt="" style="display:block;margin:0 auto 10px;width:64px;height:auto;border:0">` : "";

  const link = `color:${C.wine};text-decoration:none`;
  const dot = " &nbsp;·&nbsp; ";
  const phones = brand.phones.map((p) => `<a href="tel:${esc(p.e164)}" style="${link}">${esc(p.label)}</a>`).join(dot);
  const whatsapp = brand.whatsapp ? `${dot}<a href="https://wa.me/${esc(brand.whatsapp)}" style="${link}">WhatsApp</a>` : "";
  const socials = brand.socials.filter((s) => s.url).map((s) => `<a href="${esc(s.url)}" style="${link}">${esc(s.label)}</a>`);
  const site = siteUrl();
  const webLinks = [...socials, `<a href="${esc(site)}" style="${link}">${esc(site.replace(/^https?:\/\//, ""))}</a>`].join(dot);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(m.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.cream};font-family:${SANS};color:${C.ink};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(m.preheader)}${"&#8199;&#847;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream}"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border:1px solid ${C.line};border-radius:12px;overflow:hidden">
<tr><td style="height:4px;background:${C.wine};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 22px;border-bottom:1px solid ${C.line}">${logo}
<div style="font-family:${SERIF};font-size:21px;color:${C.wine}">${esc(brand.name)}</div>
<div style="font-size:10.5px;letter-spacing:2.5px;text-transform:uppercase;color:${C.gold};margin-top:6px">${esc(brand.tagline)}</div></td></tr>
<tr><td style="padding:30px 32px">
<h1 style="margin:0 0 18px;font-family:${SERIF};font-weight:normal;font-size:25px;line-height:1.3;color:${C.ink}">${esc(m.heading)}</h1>
${body}${details}${button}${footnote}${signOff}</td></tr>
<tr><td align="center" style="padding:22px 32px 26px;background:${C.card};border-top:1px solid ${C.line};font-size:12px;line-height:1.8;color:${C.muted}">
<div style="font-family:${SERIF};font-size:14px;color:${C.wine}">${esc(brand.name)}</div>
<div>${esc(brand.address.street)}, ${esc(brand.address.city)}, ${esc(brand.address.country)}</div>
<div>${phones}${whatsapp}</div>
<div><a href="mailto:${esc(brand.email)}" style="${link}">${esc(brand.email)}</a></div>
<div>${webLinks}</div></td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:#9a9087">This is an automated email — please do not reply to this message.<br>To get in touch, call or WhatsApp us, or write to ${esc(brand.email)}.</p>
</td></tr></table></body></html>`;

  const text = [
    m.heading,
    "",
    ...m.paragraphs,
    ...(m.details?.length ? ["", ...m.details.map((d) => `${d.label}: ${d.value}`)] : []),
    m.cta ? `\n${m.cta.label}: ${m.cta.href}` : "",
    m.footnote ?? "",
    m.signOff ? `\nWarm regards,\nThe ${brand.shortName} team` : "",
    "",
    `${brand.name} · ${brand.phones.map((p) => p.label).join(" / ")} · ${brand.email}`,
    "",
    "This is an automated email — please do not reply to this message.",
  ].join("\n");
  return { html, text };
}

/** Every template in one place. */
export const templates = {
  inquiryConfirmation: (b: Brand, d: { name: string; eventType: string; eventDate?: string | null; reference?: string }): Rendered => {
    const event = d.eventType.replace(/-/g, " ");
    return {
      subject: `We received your inquiry${d.reference ? ` (${d.reference})` : ""} — ${b.shortName}`,
      ...layout(b, {
        preheader: "Thank you for reaching out — our team will be in touch shortly.",
        heading: `Thank you, ${first(d.name)}!`,
        paragraphs: [
          `We've received your inquiry and can't wait to hear more about your ${event}.`,
          "Someone from our team will contact you shortly to talk through your ideas. If it's urgent, call or WhatsApp us any time.",
        ],
        details: [
          ...(d.reference ? [{ label: "Reference", value: d.reference }] : []),
          { label: "Event", value: event.replace(/^\w/, (c) => c.toUpperCase()) },
          ...(d.eventDate ? [{ label: "Date", value: fmtDateLong(d.eventDate) }] : []),
        ],
        signOff: true,
      }),
    };
  },
  quotationSent: (b: Brand, d: { name: string; number: string; title: string; total: number; validUntil?: string | null; token: string }): Rendered => ({
    subject: `Your quotation ${d.number} from ${b.shortName}`,
    ...layout(b, {
      preheader: `Your quotation for ${d.title} is ready — ${npr(d.total)}.`,
      heading: "Your quotation is ready",
      paragraphs: [
        `Hi ${first(d.name)}, thank you for considering us for ${d.title}. We've prepared a quotation based on everything we discussed.`,
        "Open it to review each item, download a PDF, accept it online or ask us for changes.",
      ],
      details: [
        { label: "Quotation", value: d.number },
        { label: "Event", value: d.title },
        ...(d.validUntil ? [{ label: "Valid until", value: fmtDateLong(d.validUntil) }] : []),
        { label: "Total", value: npr(d.total), strong: true },
      ],
      cta: { label: "View your quotation", href: `${siteUrl()}/quote/${d.token}` },
      footnote: "This link is personal to you — please don't share it. Questions? Call or WhatsApp us any time.",
      signOff: true,
    }),
  }),
  quotationAccepted: (b: Brand, d: { name: string; number: string; title: string; deposit: number }): Rendered => ({
    subject: `Thank you — ${d.number} accepted`,
    ...layout(b, {
      preheader: `We're delighted to be part of ${d.title}.`,
      heading: "We're delighted to be part of your celebration",
      paragraphs: [
        `Hi ${first(d.name)}, thank you for accepting quotation ${d.number} for ${d.title}.`,
        d.deposit > 0 ? "To confirm your date, an advance is due. We'll be in touch with payment details." : "We'll be in touch shortly with next steps.",
      ],
      details: [
        { label: "Quotation", value: d.number },
        { label: "Event", value: d.title },
        ...(d.deposit > 0 ? [{ label: "Advance to confirm", value: npr(d.deposit), strong: true }] : []),
      ],
      signOff: true,
    }),
  }),
  bookingConfirmation: (b: Brand, d: { name: string; number: string; title: string; date: string; venue?: string | null; portalUrl?: string | null }): Rendered => ({
    subject: `Booking confirmed — ${d.title}`,
    ...layout(b, {
      preheader: `${d.title} on ${fmtDateLong(d.date)} is confirmed.`,
      heading: "Your booking is confirmed",
      paragraphs: [`Hi ${first(d.name)}, your date is reserved! We'll share the schedule and designs as planning progresses.`],
      details: [
        { label: "Booking", value: d.number },
        { label: "Event", value: d.title },
        { label: "Date", value: fmtDateLong(d.date), strong: true },
        ...(d.venue ? [{ label: "Venue", value: d.venue }] : []),
      ],
      cta: d.portalUrl ? { label: "Open your event page", href: d.portalUrl } : undefined,
      signOff: true,
    }),
  }),
  paymentReceipt: (b: Brand, d: { name: string; receipt: string; amount: number; balance: number; title: string }): Rendered => ({
    subject: `Payment received — ${d.receipt}`,
    ...layout(b, {
      preheader: `We've received ${npr(d.amount)} — thank you.`,
      heading: "Thank you for your payment",
      paragraphs: [`Hi ${first(d.name)}, we've received your payment for ${d.title}.${d.balance > 0 ? "" : " Your booking is now fully paid."}`],
      details: [
        { label: "Receipt", value: d.receipt },
        { label: "Event", value: d.title },
        { label: "Amount received", value: npr(d.amount), strong: true },
        ...(d.balance > 0 ? [{ label: "Remaining balance", value: npr(d.balance) }] : []),
      ],
      signOff: true,
    }),
  }),
  eventReminder: (b: Brand, d: { name: string; title: string; date: string; days: number }): Rendered => ({
    subject: `${d.days} days to go — ${d.title}`,
    ...layout(b, {
      preheader: `${d.title} is on ${fmtDateLong(d.date)}.`,
      heading: "Your celebration is almost here",
      paragraphs: [
        `Hi ${first(d.name)}, just ${d.days} days to go until ${d.title}!`,
        "If anything has changed — timings, guest numbers, venue access — please let us know as soon as possible.",
      ],
      details: [
        { label: "Event", value: d.title },
        { label: "Date", value: fmtDateLong(d.date), strong: true },
      ],
      signOff: true,
    }),
  }),
  followUpReminder: (b: Brand, d: { staff: string; count: number }): Rendered => {
    const n = `${d.count} follow-up${d.count === 1 ? "" : "s"}`;
    return {
      subject: `You have ${n} today`,
      ...layout(b, {
        preheader: `${n} due today.`,
        heading: "Today's follow-ups",
        paragraphs: [`Hi ${first(d.staff)}, you have ${n} due today.`],
        cta: { label: "Open follow-ups", href: `${siteUrl()}/admin/follow-ups` },
      }),
    };
  },
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
