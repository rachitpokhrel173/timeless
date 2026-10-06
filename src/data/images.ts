import type { ImageAsset } from "@/types";

/**
 * Every photo used on the site, in one place.
 *
 * PLACEHOLDERS: these are licensed stock photos (Unsplash / Pexels) standing in until the
 * client supplies photos of their own work. Replace the file in /public/images (or point
 * `src` at the new upload) and update width/height/alt — components need no changes.
 * Do not launch with stock photos presented as the company's portfolio.
 */
const img = (file: string, alt: string, width = 1600, height = 1067, focus?: string): ImageAsset => ({
  src: `/images/${file}`,
  alt,
  width,
  height,
  focus,
});

export const images = {
  heroMandap: img(
    "hero-modern-mandap-hills.jpg",
    "Open-air wedding mandap with a gold canopy of hanging jasmine strands, a white aisle lined with white roses and hills behind",
    2400,
    1561,
    "50% 45%",
  ),
  mandapBallroom: img(
    "mandap-ceremony-ballroom.jpg",
    "Couple seated for a wedding ritual under a white floral mandap in a candle-lit ballroom",
  ),
  floralMandapOutdoor: img(
    "floral-mandap-outdoor-ceremony.jpg",
    "Outdoor wedding ceremony under a rose-covered mandap with draped ivory fabric",
  ),
  grandMandap: img(
    "grand-mandap-chandelier.jpg",
    "Grand indoor mandap with tall floral pillars, red drapes and a crystal chandelier",
  ),
  receptionRose: img(
    "reception-stage-rose-backdrop.jpg",
    "Reception stage with a wall of roses, sheer white drapes and carved seating",
  ),
  receptionRedWhite: img(
    "reception-stage-red-white.jpg",
    "Reception stage framed in red and white roses with a crossed ivory drape and a velvet sofa",
    1600,
    898,
  ),
  eveningReception: img(
    "evening-reception-chandeliers.jpg",
    "Evening reception venue lit by chandeliers hanging from palm trees, with floral pillars",
  ),
  candlelitLounge: img(
    "candlelit-lounge-decor.jpg",
    "Candle-lit lounge with blush drapes, hanging florals and velvet sofas",
  ),
  mehendiCanopy: img(
    "mehendi-colourful-canopy.jpg",
    "Mehendi setup with pink, yellow and green fabric canopies, floor cushions and umbrellas",
    1600,
    1068,
  ),
  haldiEntrance: img(
    "haldi-marigold-entrance.jpg",
    "Haldi entrance with marigold garlands, yellow drapes and paper flowers",
    1600,
    1068,
  ),
  coupleArchway: img(
    "couple-floral-archway.jpg",
    "Couple in traditional red wedding attire standing before a carved archway framed with roses",
    1600,
    1244,
    "50% 40%",
  ),
  weddingAisle: img(
    "wedding-aisle-floral-decoration.jpg",
    "Aisle lined with rose arrangements on tall stands, leading to a draped floral arch",
    1600,
    1068,
  ),
  coupleChairs: img(
    "couple-chairs-floral-decor.jpg",
    "Two chairs decorated with peach roses and signs reading Forever and Always",
  ),
  gazeboCeremony: img(
    "wedding-mandap-stage-decoration.jpg",
    "Garden gazebo wrapped in coral florals with white-draped chairs along a pink aisle",
    1600,
    2400,
    "50% 60%",
  ),
  engagementRings: img(
    "engagement-ring-ceremony-decor.jpg",
    "Engagement rings resting on fresh flowers",
  ),
  receptionTable: img(
    "reception-table-flower-centerpiece.jpg",
    "Reception table set with a fresh flower centrepiece and glassware",
    1600,
    1068,
  ),
  tableStyling: img("event-table-styling.jpg", "Long dining table styled with flowers, candles and glassware"),
  birthdayArch: img(
    "birthday-balloon-arch-cake.jpg",
    "Birthday setup with a pink and rose-gold balloon arch, a neon Happy Birthday sign and a tiered cake",
    1600,
    1067,
    "50% 35%",
  ),
  birthdayMarquee: img(
    "birthday-marquee-number-decor.jpg",
    "Light-up number 15 surrounded by pastel balloons for a birthday",
  ),
  birthdayBalloons: img("birthday-balloon-decoration.jpg", "Colourful balloons for a birthday party"),
  babyShower: img(
    "baby-shower-marquee-letters.jpg",
    "Light-up letters spelling BABY framed by pastel pink, blue and gold balloons",
  ),
  pearlBalloons: img(
    "pearl-balloon-table-decor.jpg",
    "Dessert table surrounded by pearl-white and clear balloons on a garden terrace",
  ),
  anniversary: img(
    "anniversary-balloon-backdrop.jpg",
    "Anniversary backdrop with gold 50 balloons, a champagne-bottle balloon display and flowers",
    1600,
    886,
  ),
  corporate: img("corporate-event-setup.jpg", "Audience seated at a corporate event"),
  bridalBouquet: img("bridal-bouquet.jpg", "Bride holding a bouquet of peach roses and greenery in soft evening light", 1600, 1067, "62% 50%"),
  coupleHands: img(
    "couple-hands-bouquet.jpg",
    "Close-up of a couple holding hands over a bouquet of blush roses",
    1600,
    1067,
    "45% 50%",
  ),
  weddingRings: img("wedding-rings-detail.jpg", "Two gold wedding rings resting on a soft ivory surface", 1600, 1067, "55% 50%"),
  celebrationGuests: img(
    "wedding-celebration-guests.jpg",
    "Newly married couple kissing as guests throw petals around them",
    1600,
    2400,
    "50% 40%",
  ),
  catering: img("catering-buffet-service.jpg", "Buffet counter with serving dishes of Nepali and Indian food"),
} satisfies Record<string, ImageAsset>;
