import type { ISODate } from "./common";
import type { EventTypeSlug } from "./service";

export type ContactMethod = "phone" | "whatsapp" | "email";

export type InquiryStatus = "new" | "contacted" | "quoted" | "confirmed" | "completed" | "cancelled";

/** What a visitor submits from the public inquiry form. */
export type InquiryInput = {
  name: string;
  phone: string;
  email?: string;
  eventType: EventTypeSlug;
  eventDate: ISODate;
  venue?: string;
  guestCount?: string;
  budget?: string;
  preferredContact: ContactMethod;
  servicesRequired: string[];
  /** Catalogue designs the visitor ticked, as "Section: Title (price)". */
  designs?: string[];
  theme?: string;
  details?: string;
  /** Upload URLs once file storage exists. */
  inspirationImages?: string[];
};

/** An inquiry as the admin panel sees it. */
export type Inquiry = InquiryInput & {
  id: string;
  status: InquiryStatus;
  createdAt: ISODate;
  updatedAt: ISODate;
  source?: "website" | "whatsapp" | "phone" | "instagram" | "facebook" | "referral" | "other";
  notes?: string;
  assignedTo?: string;
  followUpDate?: ISODate;
  /** Set when the inquiry turns into a booking. */
  bookingId?: string;
};

export type InquiryFieldErrors = Partial<Record<keyof InquiryInput, string>>;

/** Result returned to the form by the submit action. */
export type InquiryFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: InquiryFieldErrors;
};
