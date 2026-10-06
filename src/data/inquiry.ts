import type { ContactMethod } from "@/types";

export const guestCountOptions = ["Under 50", "50 – 150", "150 – 300", "300 – 500", "500+"] as const;

export const budgetOptions = [
  "Under Rs 50,000",
  "Rs 50,000 – 1,50,000",
  "Rs 1,50,000 – 3,00,000",
  "Rs 3,00,000 – 6,00,000",
  "Above Rs 6,00,000",
  "Not sure yet",
] as const;

export const contactMethodOptions: { value: ContactMethod; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone call" },
  { value: "email", label: "Email" },
];
