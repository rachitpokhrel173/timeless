import type { GalleryCategory, GalleryItem } from "@/types";
import { images } from "./images";

export const galleryCategories: { value: GalleryCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "weddings", label: "Wedding & Reception" },
  { value: "engagements", label: "Engagement" },
  { value: "pasni", label: "Rice Weaning & Gunyo Cholo" },
  { value: "birthdays", label: "Birthday" },
  { value: "corporate", label: "Corporate & others" },
];

/**
 * PLACEHOLDER portfolio. Location and date are intentionally left blank — they should only
 * be filled in for real events the company decorated.
 */
export const galleryItems: GalleryItem[] = [
  { id: "g-1", title: "Open-air jasmine mandap", category: "weddings", image: images.heroMandap, featured: false, placeholder: true },
  { id: "g-2", title: "Rose-wall reception stage", category: "engagements", image: images.receptionRose, featured: false, placeholder: true },
  { id: "g-3", title: "Garden gazebo ceremony", category: "weddings", image: images.gazeboCeremony, featured: true, order: 2, placeholder: true },
  { id: "g-4", title: "Pastel birthday arch", category: "birthdays", image: images.birthdayArch, featured: true, order: 8, placeholder: true },
  { id: "g-5", title: "Chandelier-lit evening reception", category: "corporate", image: images.eveningReception, featured: false, placeholder: true },
  { id: "g-6", title: "Marigold haldi entrance", category: "other", image: images.haldiEntrance, featured: true, order: 5, placeholder: true },
  { id: "g-7", title: "Couple under a floral archway", category: "engagements", image: images.coupleArchway, featured: true, order: 7, placeholder: true },
  { id: "g-8", title: "Ballroom mandap ceremony", category: "weddings", image: images.mandapBallroom, featured: false, placeholder: true },
  { id: "g-9", title: "Pearl balloon dessert table", category: "birthdays", image: images.pearlBalloons, featured: true, order: 9, placeholder: true },
  { id: "g-10", title: "Red and white reception stage", category: "weddings", image: images.receptionRedWhite, featured: false, placeholder: true },
  { id: "g-11", title: "Mehendi canopy lounge", category: "other", image: images.mehendiCanopy, featured: false, placeholder: true },
  { id: "g-12", title: "Grand chandelier mandap", category: "weddings", image: images.grandMandap, featured: true, order: 6, placeholder: true },
  { id: "g-13", title: "Baby shower welcome", category: "other", image: images.babyShower, featured: false, placeholder: true },
  { id: "g-14", title: "Golden anniversary backdrop", category: "other", image: images.anniversary, featured: false, placeholder: true },
  { id: "g-15", title: "Floral aisle", category: "weddings", image: images.weddingAisle, featured: true, order: 3, placeholder: true },
  { id: "g-16", title: "Company annual function", category: "corporate", image: images.corporate, featured: false, placeholder: true },
  { id: "g-17", title: "Petals at the send-off", category: "weddings", image: images.celebrationGuests, featured: true, order: 4, placeholder: true },
  { id: "g-18", title: "Rose mandap in the garden", category: "weddings", image: images.floralMandapOutdoor, featured: false, placeholder: true },
  { id: "g-19", title: "Candle-lit reception lounge", category: "weddings", image: images.candlelitLounge, featured: true, order: 1, placeholder: true },
];
