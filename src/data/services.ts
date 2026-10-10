import type { Service } from "@/types";
import { images } from "./images";

export const services: Service[] = [
  {
    id: "svc-wedding",
    slug: "wedding-decoration",
    name: "Wedding Decoration",
    summary: "Mandaps, stages, entrances and aisles",
    description:
      "Mandap and stage design, entrance gates, floral aisles and seating — planned around your rituals, your colours and the shape of your venue.",
    image: images.mandapBallroom,
    featured: true,
    order: 1,
  },
  {
    id: "svc-engagement",
    slug: "engagement-decoration",
    name: "Engagement Decoration",
    summary: "Ring ceremonies with a personal touch",
    description:
      "Backdrops, couple seating and floral details for ring ceremonies, from an intimate family gathering to a full evening celebration.",
    image: images.receptionRose,
    featured: true,
    order: 2,
  },
  {
    id: "svc-reception",
    slug: "reception-decoration",
    name: "Reception Decoration",
    summary: "Stages and halls for the evening",
    description:
      "Reception stages, table styling, lighting and photo corners that carry your wedding theme into the evening.",
    image: images.receptionRedWhite,
    featured: true,
    order: 3,
  },
  {
    id: "svc-mehendi-haldi",
    slug: "haldi-mehendi-decoration",
    name: "Haldi & Mehendi",
    summary: "Colour, marigolds and floor seating",
    description:
      "Bright, playful setups for pre-wedding ceremonies — marigold garlands, fabric canopies, floor cushions and spaces made for photos.",
    image: images.haldiEntrance,
    featured: true,
    order: 4,
  },
  {
    id: "svc-birthday",
    slug: "birthday-decoration",
    name: "Birthday Decoration",
    summary: "Balloon arches, backdrops and cake tables",
    description:
      "Balloon garlands, themed backdrops and cake tables for first birthdays, milestone birthdays and surprise parties.",
    image: images.birthdayArch,
    featured: true,
    order: 5,
  },
  {
    id: "svc-party",
    slug: "party-decoration",
    name: "Party Decoration",
    summary: "Anniversaries, showers and get-togethers",
    description:
      "Anniversaries, baby showers, farewells and house parties — styled to feel special without feeling overdone.",
    image: images.pearlBalloons,
    featured: true,
    order: 6,
  },
  {
    id: "svc-corporate",
    slug: "corporate-events",
    name: "Corporate Events",
    summary: "Launches, annual functions and dinners",
    description:
      "Product launches, annual functions and office celebrations — clean, on-brand setups delivered on schedule.",
    image: images.eveningReception,
    featured: true,
    order: 7,
  },
  {
    id: "svc-custom",
    slug: "custom-event-decor",
    name: "Custom Event Décor",
    summary: "Pasni, bratabandha and everything else",
    description:
      "Pasni, bratabandha, puja and any occasion that doesn't fit a category. Tell us what it means to your family and we'll design around it.",
    image: images.grandMandap,
    featured: true,
    order: 8,
  },
  {
    id: "svc-catering",
    slug: "catering",
    name: "Food & Catering",
    summary: "Menus planned with you",
    description: "Nepali, Indian and continental menus planned with you and served by our own team.",
    image: images.tableStyling,
    featured: false,
    order: 9,
  },
  {
    id: "svc-baja-sound",
    slug: "baja-sound-system",
    name: "Baja & Sound System",
    summary: "Panche baja, band baja, DJ and sound",
    description:
      "Panche baja and band baja for the procession, plus DJ, live music and a full sound setup for the ceremony and reception.",
    image: images.celebrationGuests,
    featured: false,
    order: 10,
  },
  {
    id: "svc-management",
    slug: "event-management",
    name: "Full Event Management",
    summary: "Venue, vendors and on-the-day coordination",
    description:
      "Venue, vendors, timeline and on-the-day coordination. One team and one point of contact from the first call to the last guest.",
    image: images.receptionTable,
    featured: false,
    order: 11,
  },
];

/** Options for "Services required" in the inquiry form. */
export const inquiryServiceOptions = [
  "Decoration",
  "Table & seating styling",
  "Lighting",
  "Catering",
  "Baja & live music",
  "Tent setup",
  "DJ & sound",
  "Furniture & décor rental",
  "Photography & videography",
  "Makeup & mehendi",
  "Full event management",
  "Other",
] as const;

/** Sub-options revealed (all pre-ticked) when "Decoration" is ticked. */
export const decorationOptions = [
  "Stage / mandap décor",
  "Entrance décor",
  "Floral arrangements",
  "Balloon décor",
  "Photo backdrop",
] as const;
