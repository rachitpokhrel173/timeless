import type { ISODate } from "./common";
import type { EventTypeSlug } from "./service";

/**
 * A booking only exists once the admin has reviewed an inquiry and sent a quote.
 * Submitting the public form never creates a confirmed booking.
 *
 * Flow: inquiry → admin review → quote sent → customer confirms → event → completed
 */
export type BookingStatus = "quoted" | "confirmed" | "in-progress" | "completed" | "cancelled";

export type QuoteLineItem = { description: string; amount: number };

export type Quote = {
  id: string;
  items: QuoteLineItem[];
  /** NPR. */
  total: number;
  sentAt?: ISODate;
  validUntil?: ISODate;
  acceptedAt?: ISODate;
};

export type Booking = {
  id: string;
  inquiryId: string;
  customerName: string;
  phone: string;
  eventType: EventTypeSlug;
  eventDate: ISODate;
  venue: string;
  status: BookingStatus;
  quote?: Quote;
  /** NPR. */
  advancePaid?: number;
  assignedTo?: string[];
  notes?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
};
