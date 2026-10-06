import type { CatalogueItem, CatalogueSection, Price, PriceList } from "@/types";

/*
 * Décor catalogue and rate cards, from the client's price sheets (October 2026).
 * Photos are cropped from those sheets into /public/images/catalogue.
 */

const item = (file: string, title: string, alt: string, width: number, height: number, price: Price): CatalogueItem => ({
  id: `cat-${file}`,
  title,
  image: { src: `/images/catalogue/${file}.jpg`, alt, width, height },
  price,
});

const rs = (amount: number, unit?: string): Price => ({ amount, unit });
const from = (amount: number, unit?: string): Price => ({ amount, unit, from: true });
const onRequest: Price = {};

export const catalogueSections: CatalogueSection[] = [
  {
    id: "cat-stage",
    slug: "stage",
    name: "Stage Décor",
    intro: "Reception and wedding stages — floral frames, draped backdrops, couple seating and uplighting.",
    order: 1,
    items: [
      item("stage-red-rose-hexagon", "Red Rose Hexagon Stage", "Wide stage with a fairy-light curtain, red rose garland and gold hexagon frames dressed in red roses", 712, 475, rs(30000)),
      item("stage-pink-floral-canopy", "Blush Floral Canopy", "Couple on a carved red sofa under an arch of pink and white flowers with pink side drapes", 625, 485, rs(20000)),
      item("stage-white-gerbera-ring", "White Gerbera Ring", "Gold ring arch covered in white gerberas behind a carved gold chaise, with candles and greenery", 691, 542, rs(30000)),
      item("stage-green-white-frame", "Garden Frame Stage", "Square floral frame of white flowers and greenery around a blush sofa and coffee table", 532, 487, rs(30000)),
      item("stage-pink-rose-frame", "Pink Rose Frame Stage", "Pink rose frame with a pink drape, red throne chairs and a carved centre table", 567, 442, rs(25000)),
    ],
  },
  {
    id: "cat-entrance",
    slug: "entrance",
    name: "Entrance Décor",
    intro: "Gates, tunnels and canopies that welcome your guests in.",
    order: 2,
    items: [
      item("entrance-ivory-drape-canopy", "Ivory Drape Canopy", "Venue entrance with a white floral canopy, ivory drapes, string lights and a welcome sign", 571, 540, rs(40000)),
      item("entrance-modern-corner", "Modern Corner", "Hall entrance with a white floral canopy, hanging wisteria, drapes and lit flower pillars", 416, 541, rs(35000)),
      item("entrance-pastel-floral-walkway", "Pastel Floral Walkway", "Red-carpet walkway under a pastel floral canopy with draped fabric and lit flower stands", 518, 429, rs(50000)),
      item("entrance-rose-arch-tunnel", "Rose Arch Tunnel", "Tunnel of red, pink and white rose arches over a red carpet leading to the venue", 551, 542, rs(20000, "per arch")),
      item("entrance-red-drape-pergola", "Red Drape Pergola", "Pergola entrance of red drapes topped with red roses outside a white venue", 416, 541, rs(15000, "each")),
      item("entrance-red-floral-frame", "Red Floral Frame", "Series of red rose frames with red drapes along a stone courtyard path", 417, 439, rs(15000, "each")),
      item("entrance-golden-dome-tunnel", "Golden Dome Tunnel", "Domed gold-fabric tunnel edged with greenery and a chandelier at dusk", 521, 506, rs(15000, "each")),
    ],
  },
  {
    id: "cat-aisle",
    slug: "aisle",
    name: "Aisle & Walkway",
    intro: "Flower-lined aisles, runners and stands for the walk to the mandap or stage.",
    order: 3,
    items: [
      item("aisle-white-wildflower", "White Wildflower Aisle", "Bride walking down a white aisle lined with white wildflowers and sparklers", 390, 541, rs(1500, "per ft")),
      item("aisle-colourful-rose-runner", "Colourful Rose Runner", "White aisle runner edged with multicoloured roses leading to a stage", 416, 541, rs(1500, "per ft")),
      item("aisle-mirror-runway", "Mirror Runway", "Mirror aisle on a lawn bordered with pink and purple flowers", 417, 541, rs(2000, "per ft")),
      item("aisle-white-pillar-stands", "White Pillar Stands", "Aisle of white Roman pillars topped with white flowers and draped fabric", 567, 539, rs(1000, "per piece")),
      item("aisle-red-white-stands", "Red & White Stands", "Red carpet aisle lined with gold stands, red and white roses and swagged fabric", 551, 541, rs(1000, "per piece")),
      item("aisle-chandelier-garden", "Chandelier Garden Aisle", "White aisle beneath gold chandelier arches lined with blush flowers", 576, 541, onRequest),
      item("aisle-floral-arch-ceremony", "Floral Arch Ceremony", "View through a round floral arch down a white aisle to a white mandap", 579, 542, onRequest),
    ],
  },
  {
    id: "cat-backdrops",
    slug: "backdrops",
    name: "Floral Backdrops",
    intro: "Photo backdrops for haldi, mehendi, engagements and the reception corner.",
    order: 4,
    items: [
      item("backdrop-pampas-moon-arch", "Pampas Moon Arch", "Gold ring arch with white orchids and pampas grass in a garden", 567, 478, rs(20000)),
      item("backdrop-crescent-candle-arch", "Crescent Candle Arch", "Crescent arch of white flowers and candles against an ivory drape", 551, 419, rs(20000)),
      item("backdrop-ivory-rose-arch", "Ivory Rose Arch", "White and green floral arch with lit flower lamps against white drapes", 416, 442, rs(20000)),
      item("backdrop-garden-rose-frame", "Garden Rose Frame", "Soft-lit backdrop framed with white and pink roses", 417, 541, rs(20000)),
      item("backdrop-gold-frame-sofa", "Gold Frame & Sofa", "Gold frames with a cascade of red and pink roses over a white sofa", 579, 542, rs(20000)),
      item("backdrop-twin-gold-arches", "Twin Gold Arches", "Two gold arches with pink and white flowers and hanging crystal lanterns", 416, 541, rs(16000)),
      item("backdrop-red-drape-corner", "Red Drape Corner", "White drape backdrop with a red swag and red and white floral corners", 576, 541, rs(12000)),
    ],
  },
  {
    id: "cat-boards",
    slug: "welcome-boards",
    name: "Welcome Boards & Photo Walls",
    intro: "Personalised boards and photo panels with your names, pictures and story.",
    order: 5,
    items: [
      item("board-arched-photo-panels", "Arched Photo Panels", "Three white arched panels with couple portraits, a monogram and pastel flowers", 567, 539, rs(40000)),
      item("board-couple-name-wall", "Couple Name Wall", "Script welcome wall with the couple's names, framed by flowers and warm lights", 579, 542, rs(35000)),
      item("board-better-together-arch", "Better Together Arch", "White arched board with 'Better Together' script and white roses", 551, 541, rs(25000)),
      item("board-pink-floral-arch", "Pink Floral Arch", "Pink arched backdrop wrapped in a garden-flower arch with uplights", 417, 541, rs(20000)),
      item("board-love-story-welcome", "Love Story Welcome", "Arched 'Welcome to our love story' board with a photo collage and white flowers", 521, 541, rs(15000)),
      item("board-arched-photo-frames", "Arched Photo Frames", "Row of cream arched frames with couple photos and flowers along a walkway", 416, 541, rs(6000, "each")),
      item("board-photo-memory-lane", "Photo Memory Lane", "Line of couple photo panels along a path edged with white roses", 416, 489, rs(4500, "each")),
    ],
  },
];

export const priceLists: PriceList[] = [
  {
    id: "rate-baja",
    slug: "baja",
    name: "Baja & Music",
    order: 1,
    rows: [
      { label: "Panche Baja", price: from(50000) },
      { label: "Band Baja", price: from(60000) },
      { label: "Live Nepali Instrumental", price: from(20000) },
      { label: "Live Band", price: from(35000) },
      { label: "Solo Singer", price: from(10000) },
    ],
  },
  {
    id: "rate-tentage",
    slug: "tentage",
    name: "Tentage",
    order: 2,
    rows: [
      { label: "Waterproof Tent", price: rs(20, "per sq ft") },
      { label: "Non-waterproof Tent", price: rs(12, "per sq ft") },
      { label: "Ceiling Draping", price: rs(25, "per sq ft") },
      { label: "Canopies", price: rs(5000, "each") },
      { label: "Satellite Canopy", price: from(15000) },
    ],
  },
  {
    id: "rate-lights-sound",
    slug: "lights-sound",
    name: "Lights & Sound",
    order: 3,
    rows: [
      { label: "DJ with Sound System", price: from(15000) },
      { label: "Standalone Speaker", price: from(5000) },
      { label: "Stage Sound Setup", price: from(15000) },
      { label: "Cube Laser Lights", price: from(30000) },
      { label: "Smoke Machine", price: rs(18000) },
      { label: "Cold Pyros", price: rs(1000, "each") },
    ],
  },
  {
    id: "rate-rental",
    slug: "rental",
    name: "Rentals",
    order: 4,
    rows: [
      { label: "Umbrella", price: rs(1500, "per piece") },
      { label: "Couch", price: rs(5000, "per piece") },
      { label: "Mandap Chair", price: rs(5000, "per piece") },
      { label: "Tiffany Chair", price: rs(400, "per piece") },
      { label: "Doli", price: rs(10000) },
      { label: "Urli", price: rs(5000) },
    ],
  },
];

/** "What we offer" — everything the team can arrange, from the client's sheet. */
export const offerings = [
  "Event Management & Coordination",
  "Floral Decoration",
  "Wedding Concept & Décor",
  "Venues & Locations",
  "Band Baja & Panche Baja",
  "Live Nepali Instrumental & Live Band",
  "Bridal Styling — Makeup & Hair",
  "Lighting & Tent Setup",
  "Horse Cart",
  "Choreographer & Emcee",
  "Mehendi Artist & Live Painting",
  "DJ & Sound System",
  "Photography & Videography",
  "Saipata & Supadi Packaging",
  "Dhol & Safa",
  "Cakes",
  "Shuttle Service & Vehicle Hire",
] as const;

export const PRICE_NOTE = "Prices are subject to change based on time and location.";
