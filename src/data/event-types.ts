import type { EventType } from "@/types";
import { images } from "./images";

export const eventTypes: EventType[] = [
  { id: "evt-wedding", slug: "wedding", name: "Weddings", image: images.floralMandapOutdoor, showOnHome: true },
  { id: "evt-engagement", slug: "engagement", name: "Engagements", image: images.coupleArchway, showOnHome: true },
  { id: "evt-birthday", slug: "birthday", name: "Birthdays", image: images.birthdayMarquee, showOnHome: true },
  { id: "evt-corporate", slug: "corporate", name: "Corporate Events", image: images.corporate, showOnHome: true },
  { id: "evt-baby-shower", slug: "baby-shower", name: "Baby Showers", image: images.babyShower, showOnHome: true },
  { id: "evt-mehendi-haldi", slug: "mehendi-haldi", name: "Mehendi & Haldi", image: images.mehendiCanopy, showOnHome: true },
  { id: "evt-anniversary", slug: "anniversary", name: "Anniversaries", image: images.anniversary, showOnHome: true },
  { id: "evt-private-party", slug: "private-party", name: "Private Parties", image: images.candlelitLounge, showOnHome: true },
  // Form-only options
  { id: "evt-reception", slug: "reception", name: "Reception" },
  { id: "evt-pasni", slug: "pasni", name: "Pasni" },
  { id: "evt-bratabandha", slug: "bratabandha", name: "Bratabandha" },
  { id: "evt-other", slug: "other", name: "Other" },
];
