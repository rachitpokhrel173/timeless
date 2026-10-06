import type { HomeContent } from "@/types";
import { images } from "./images";

// Editorial copy for homepage sections. Kept as data so a future CMS "Pages" screen can own it.

export const reasons = [
  {
    title: "Thoughtful Design",
    text: "Every setup is planned around your theme, venue and vision — not pulled from a catalogue.",
  },
  {
    title: "Personalized Concepts",
    text: "We don't believe every celebration should look the same. Your traditions and taste lead the design.",
  },
  {
    title: "Attention to Detail",
    text: "From the smallest finishing touch to the overall atmosphere, every piece is considered.",
  },
  {
    title: "End-to-End Support",
    text: "From concept to setup, we help make your event feel effortless, so your family can stay present.",
  },
];

export const reasonsImages = {
  primary: images.coupleChairs,
  secondary: images.receptionTable,
};

export const processSteps = [
  {
    title: "Share Your Vision",
    text: "Tell us your date, venue, guest count and the photos you love — the inquiry form, a call or WhatsApp all work.",
  },
  {
    title: "Discuss Your Ideas",
    text: "We talk through your theme, colours, rituals and budget, and suggest what will work best in your space.",
  },
  {
    title: "Design Your Event",
    text: "You receive a concept and an itemised quote. We refine it together until it feels right.",
  },
  {
    title: "Celebrate the Moment",
    text: "Our team sets everything up before your guests arrive, so you can simply enjoy the day.",
  },
];

/**
 * Homepage content. Every string and photo on the homepage comes from here so the future
 * admin "Pages → Home" screen can edit it without touching components.
 * Photos are stock placeholders (see images.ts) until the client supplies their own work.
 */
export const homeContent: HomeContent = {
  hero: {
    eyebrow: "Timeless Ties Events & Decor",
    headline: "We Turn Moments\nInto Timeless Memories.",
    intro: "Weddings, engagements, birthdays & celebrations beautifully designed around you.",
    image: images.heroMandap,
  },
  about: {
    eyebrow: "About Us",
    heading: "Your Vision. Our Craft.",
    body: "At Timeless Ties Events & Decor, we believe every celebration deserves a setting as special as the people in it. With a passion for creativity and an eye for detail, we design spaces that bring your vision to life — beautifully, effortlessly, and with a personal touch.",
    image: images.tableStyling,
    features: [
      { icon: "design", title: "Bespoke Décor", text: "Tailored to your style" },
      { icon: "details", title: "Thoughtful Details", text: "Little things, big impact" },
      { icon: "execution", title: "Seamless Execution", text: "From setup to send-off" },
    ],
  },
  services: {
    eyebrow: "Our Services",
    heading: "Beautifully Styled\nfor Every Occasion",
    items: [
      { id: "hs-wedding", name: "Weddings", slug: "wedding-decoration", eventType: "wedding", image: images.weddingAisle },
      { id: "hs-engagement", name: "Engagements", slug: "engagement-decoration", eventType: "engagement", image: images.receptionRose },
      { id: "hs-birthday", name: "Birthdays &\nCelebrations", slug: "birthday-decoration", eventType: "birthday", image: images.birthdayArch },
      { id: "hs-corporate", name: "Corporate &\nSpecial Events", slug: "corporate-events", eventType: "corporate", image: images.eveningReception },
    ],
  },
  gallery: {
    eyebrow: "Featured Work",
    heading: "Moments We've\nStyled",
    intro: "From intimate gatherings to grand celebrations, explore some of our favourite events and the stories behind them.",
  },
  touch: {
    eyebrow: "The Timeless Touch",
    heading: "It's not just decoration.\nIt's the atmosphere people remember.",
    body: "From breathtaking floral arrangements and elegant backdrops to curated tablescapes and ambient lighting, we handle every detail so you can simply enjoy the moment.",
    image: images.receptionTable,
    items: ["Floral Design", "Backdrops & Arches", "Tablescapes", "Lighting & Ambience", "Custom Styling"],
  },
  packages: {
    eyebrow: "Our Packages",
    heading: "Designed for\nEvery Celebration",
    intro: "Choose the package that fits your day, or let's create a custom experience just for you.",
    items: [
      { name: "Essential", text: "Small celebrations", image: images.coupleChairs },
      { name: "Signature", text: "Elegant event styling", image: images.mandapBallroom },
      { name: "Bespoke", text: "Fully customised experiences", image: images.grandMandap },
    ],
  },
  process: {
    eyebrow: "Our Process",
    heading: "Simple Steps to\nSomething Beautiful",
    steps: [
      { icon: "vision", title: "Tell Us Your Vision", text: "Share your ideas, style and preferences." },
      { icon: "design", title: "We Design", text: "We create a concept that brings your vision to life." },
      { icon: "details", title: "We Perfect the Details", text: "From florals to lighting, everything is set." },
      { icon: "celebrate", title: "You Celebrate", text: "Relax and enjoy your special day." },
    ],
  },
  testimonials: { eyebrow: "Kind Words", heading: "What Our Clients Say", intro: "Real stories. Happy celebrations." },
  social: {
    heading: "Follow the Celebrations",
    images: [
      images.floralMandapOutdoor,
      images.candlelitLounge,
      images.coupleArchway,
      images.receptionRedWhite,
      images.pearlBalloons,
      images.mehendiCanopy,
      images.gazeboCeremony,
    ],
  },
  // PLACEHOLDER: needs real "before" photos of empty venues — take them at the next few setups
  transform: {
    eyebrow: "The Transformation",
    heading: "From Empty Venue\nto Unforgettable",
    intro: "Drag the slider to see how we turn a blank space into a celebration your guests will talk about for years.",
    items: [
      { label: "Wedding", before: images.floralMandapOutdoor, after: images.floralMandapOutdoor, simulateBefore: true },
      { label: "Reception", before: images.receptionRose, after: images.receptionRose, simulateBefore: true },
      { label: "Birthday", before: images.birthdayArch, after: images.birthdayArch, simulateBefore: true },
    ],
    placeholder: true,
  },
  // PLACEHOLDER: sample figures — replace with the client's real numbers, then remove `placeholder`
  stats: {
    items: [
      { value: 250, suffix: "+", label: "Events decorated" },
      { value: 6, suffix: "+", label: "Years of experience" },
      { value: 120, suffix: "+", label: "Happy couples" },
      { value: 15, suffix: "+", label: "Venues across the valley" },
    ],
    placeholder: true,
  },
  // PLACEHOLDER: replace with the client's real offer and remove `placeholder` to show it on the live site
  offer: {
    enabled: true,
    id: "sample-offer",
    eyebrow: "Special Offer",
    heading: "Book Your Celebration\nThis Season",
    body: "Describe the offer here — for example a discount, a free add-on, or a complimentary décor consultation for bookings made this month.",
    highlight: "XX%",
    highlightNote: "off décor",
    perks: ["First perk of the offer", "Second perk of the offer", "Third perk of the offer"],
    note: "Add the terms here, e.g. valid until a date.",
    cta: "Claim This Offer",
    image: images.floralMandapOutdoor,
    placeholder: true,
  },
  cta: {
    heading: "Planning Something Beautiful?",
    body: "Let's create a space that feels unmistakably yours.",
    image: images.eveningReception,
  },
};
