"use server";

import { after } from "next/server";
import { adminDb, schema, tbl } from "@/db";
import { getCatalogue, getEventTypes, getInquiryOptions, getSiteSettings } from "@/lib/content";
import { deliverInquiry } from "@/lib/inquiries";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, clientUserAgent, deviceFromUserAgent, hashIp } from "@/lib/request";
import { formatPrice } from "@/lib/utils";
import { onInquiryCreated } from "@/server/automation";
import { createInquiry } from "@/server/crm";
import type { ContactMethod, EventTypeSlug, InquiryFieldErrors, InquiryFormState, InquiryInput } from "@/types";

const text = (formData: FormData, key: string, max = 200) => String(formData.get(key) ?? "").trim().slice(0, max);

const CONTACT_METHODS: ContactMethod[] = ["whatsapp", "phone", "email"];

/** Ticked catalogue ids → readable lines for whoever handles the inquiry; unknown ids are dropped. */
async function designsFrom(ids: string[]) {
  if (!ids.length) return [];
  const catalogue = await getCatalogue();
  return catalogue.flatMap((section) =>
    section.items.filter((i) => ids.includes(i.id)).map((i) => `${section.name}: ${i.title} (${formatPrice(i.price)})`),
  );
}

export async function submitInquiry(_prev: InquiryFormState, formData: FormData): Promise<InquiryFormState> {
  // Honeypot — real visitors never see or fill this field
  if (text(formData, "company")) return { status: "success" };

  const [site, eventTypes, options] = await Promise.all([getSiteSettings(), getEventTypes(), getInquiryOptions()]);
  const ip = await clientIp();
  const ipHash = hashIp(ip);

  // 5 inquiries per 10 minutes per visitor is plenty for real people and stops floods
  if (!(await rateLimit(`inquiry:${ipHash ?? "unknown"}`, 5, 600))) {
    return {
      status: "error",
      message: `You've sent several inquiries in a short time. Please wait a few minutes, or call us on ${site.phones[0].label}.`,
    };
  }

  const eventType = text(formData, "eventType") as EventTypeSlug;
  const preferredContact = text(formData, "preferredContact") as ContactMethod;
  const allowedServices = [...options.services, ...options.decorationOptions];
  const input: InquiryInput = {
    name: text(formData, "name", 120),
    phone: text(formData, "phone", 30),
    email: text(formData, "email", 160) || undefined,
    eventType,
    eventDate: text(formData, "eventDate", 10),
    venue: text(formData, "venue") || undefined,
    guestCount: text(formData, "guestCount", 40) || undefined,
    budget: text(formData, "budget", 60) || undefined,
    preferredContact,
    servicesRequired: formData
      .getAll("servicesRequired")
      .map(String)
      .filter((s) => allowedServices.includes(s))
      // "Other" carries the visitor's own description when they wrote one
      .map((s) => (s === "Other" && text(formData, "servicesOther") ? `Other: ${text(formData, "servicesOther")}` : s)),
    designs: await designsFrom(formData.getAll("designs").map(String).slice(0, 50)),
    theme: text(formData, "theme") || undefined,
    details: text(formData, "details", 3000) || undefined,
    inspirationImages: text(formData, "inspiration", 1000)
      .split(/\s+/)
      .filter((u) => /^https?:\/\//.test(u))
      .slice(0, 10),
  };

  const errors: InquiryFieldErrors = {};
  if (input.name.length < 2) errors.name = "Please enter your name.";
  if (!/^\+?[\d\s-]{7,}$/.test(input.phone)) errors.phone = "Please enter a valid phone number.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.email = "Please enter a valid email address.";
  if (!eventTypes.some((e) => e.slug === eventType)) errors.eventType = "Please choose an event type.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) errors.eventDate = "Please choose your event date.";
  else if (input.eventDate < new Date().toISOString().slice(0, 10)) errors.eventDate = "Please choose a date that hasn't passed.";
  if (!CONTACT_METHODS.includes(preferredContact)) errors.preferredContact = "Please choose how we should contact you.";
  if (preferredContact === "email" && !input.email) errors.email = "Please add your email so we can reply.";

  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Please check the highlighted fields.", errors };
  }

  const utm: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const v = text(formData, `attr_${k}`, 100);
    if (v) utm[k] = v;
  }
  const userAgent = await clientUserAgent();

  try {
    const { lead, inquiry } = await createInquiry({
      kind: "INQUIRY",
      name: input.name,
      phone: input.phone,
      email: input.email,
      eventType: input.eventType,
      eventDate: input.eventDate,
      venue: input.venue,
      guestCount: input.guestCount,
      budget: input.budget,
      preferredContact: input.preferredContact,
      services: input.servicesRequired,
      designs: input.designs ?? [],
      theme: input.theme,
      message: input.details,
      inspirationLinks: input.inspirationImages ?? [],
      utm: Object.keys(utm).length ? utm : null,
      referrer: text(formData, "attr_referrer", 200) || null,
      landingPage: text(formData, "attr_landing", 200) || null,
      device: deviceFromUserAgent(userAgent),
      ipHash,
    });
    // Notifications, confirmation email and any external webhook run after the response
    after(async () => {
      await onInquiryCreated({ inquiryId: inquiry.id, number: inquiry.number, kind: inquiry.kind, leadId: lead.id, name: input.name, email: input.email, eventType: input.eventType, eventDate: input.eventDate, guestCount: input.guestCount }).catch((e) =>
        console.error("[inquiry] automation failed", e),
      );
      if (process.env.INQUIRY_WEBHOOK_URL) await deliverInquiry(input);
    });
  } catch (error) {
    console.error("[inquiry] could not be saved", error);
    return {
      status: "error",
      message: `Sorry — we couldn't send your inquiry online right now. Please call us on ${site.phones[0].label} or message us on WhatsApp.`,
    };
  }

  return {
    status: "success",
    message: "Thank you! We've received your inquiry and will get back to you shortly.",
  };
}

/** Events on one day before it counts as busy. Only a rough signal is shown — never counts or names. */
const BUSY_AT = 3;

/** How open a date looks, for the hint under the inquiry form's date field. */
export async function checkDateAvailability(date: string): Promise<"open" | "popular" | "busy" | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return null;
  try {
    if (!(await rateLimit(`date-check:${hashIp(await clientIp()) ?? "unknown"}`, 40, 600))) return null;
    const { count, error } = await adminDb.from(tbl(schema.events)).select("id", { count: "exact", head: true }).eq("event_date", date).neq("status", "CANCELLED");
    if (error) return null;
    return !count ? "open" : count < BUSY_AT ? "popular" : "busy";
  } catch {
    return null;
  }
}
