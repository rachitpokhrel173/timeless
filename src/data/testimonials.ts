import type { Testimonial } from "@/types";

/**
 * PLACEHOLDERS ONLY — not real reviews. They render (with a visible label) in development so
 * the layout can be reviewed, and are filtered out in production. Replace with genuine
 * reviews the client has permission to publish.
 */
export const testimonials: Testimonial[] = [
  {
    id: "t-1",
    customerName: "Client name",
    eventType: "Wedding",
    quote:
      "A short placeholder review goes here — how the décor looked on the day, how the team handled the setup, and how the family felt.",
    placeholder: true,
  },
  {
    id: "t-2",
    customerName: "Client name",
    eventType: "Birthday",
    quote:
      "A second placeholder review. Real reviews from Google, Facebook or WhatsApp can be added here once the client shares them.",
    placeholder: true,
  },
  {
    id: "t-3",
    customerName: "Client name",
    eventType: "Engagement",
    quote:
      "A third placeholder review. Keep genuine quotes short — two or three sentences read best on mobile.",
    placeholder: true,
  },
];
