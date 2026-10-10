import "server-only";
import { getInquiryOptions } from "@/lib/content";
import { campaignOptions, eventTypeOptions, sourceOptions, userOptions } from "@/server/lookups";
import type { LeadFormOptions } from "./LeadForm";

export async function leadFormOptions(): Promise<LeadFormOptions> {
  const [eventTypes, users, campaigns, sources, inquiry] = await Promise.all([eventTypeOptions(), userOptions(), campaignOptions(), sourceOptions(), getInquiryOptions()]);
  return { eventTypes, users, campaigns, sources, guestCounts: inquiry.guestCounts, budgets: inquiry.budgets };
}
