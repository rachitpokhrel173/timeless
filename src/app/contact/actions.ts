"use server";

import { catalogueSections } from "@/data/catalogue";
import { eventTypes } from "@/data/event-types";
import { decorationOptions, inquiryServiceOptions } from "@/data/services";
import { siteSettings } from "@/data/site";
import { deliverInquiry } from "@/lib/inquiries";
import { formatPrice } from "@/lib/utils";
import type { ContactMethod, EventTypeSlug, InquiryFieldErrors, InquiryFormState, InquiryInput } from "@/types";

const text = (formData: FormData, key: string, max = 200) => String(formData.get(key) ?? "").trim().slice(0, max);

const CONTACT_METHODS: ContactMethod[] = ["whatsapp", "phone", "email"];

/** Ticked catalogue ids → readable lines for whoever handles the inquiry; unknown ids are dropped. */
function designsFrom(ids: string[]) {
  return catalogueSections.flatMap((section) =>
    section.items.filter((i) => ids.includes(i.id)).map((i) => `${section.name}: ${i.title} (${formatPrice(i.price)})`),
  );
}

export async function submitInquiry(_prev: InquiryFormState, formData: FormData): Promise<InquiryFormState> {
  // Honeypot — real visitors never see or fill this field
  if (text(formData, "company")) return { status: "success" };

  const eventType = text(formData, "eventType") as EventTypeSlug;
  const preferredContact = text(formData, "preferredContact") as ContactMethod;
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
      .filter((s) => ([...inquiryServiceOptions, ...decorationOptions] as readonly string[]).includes(s))
      // "Other" carries the visitor's own description when they wrote one
      .map((s) => (s === "Other" && text(formData, "servicesOther") ? `Other: ${text(formData, "servicesOther")}` : s)),
    designs: designsFrom(formData.getAll("designs").map(String)),
    theme: text(formData, "theme") || undefined,
    details: text(formData, "details", 3000) || undefined,
    inspirationImages: text(formData, "inspiration", 1000)
      .split(/\s+/)
      .filter((u) => /^https?:\/\//.test(u)),
  };

  const errors: InquiryFieldErrors = {};
  if (input.name.length < 2) errors.name = "Please enter your name.";
  if (!/^\+?[\d\s-]{7,}$/.test(input.phone)) errors.phone = "Please enter a valid phone number.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.email = "Please enter a valid email address.";
  if (!eventTypes.some((e) => e.slug === eventType)) errors.eventType = "Please choose an event type.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) errors.eventDate = "Please choose your event date.";
  if (!CONTACT_METHODS.includes(preferredContact)) errors.preferredContact = "Please choose how we should contact you.";
  if (preferredContact === "email" && !input.email) errors.email = "Please add your email so we can reply.";

  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Please check the highlighted fields.", errors };
  }

  const result = await deliverInquiry(input);
  if (!result.ok) {
    return {
      status: "error",
      message: `Sorry — we couldn't send your inquiry online right now. Please call us on ${siteSettings.phones[0].label} or message us on WhatsApp.`,
    };
  }

  return {
    status: "success",
    message: "Thank you! We've received your inquiry and will get back to you shortly.",
  };
}
