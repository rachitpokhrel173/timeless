import type { ImageAsset } from "./common";
import type { EventTypeSlug } from "./service";

/*
 * Homepage content. Text fields support "\n" for a line break and "*word*" for italic accent.
 */

/** One tile in the homepage services row. */
export type HomeService = {
  id: string;
  name: string;
  /** Links to /services#slug. */
  slug: string;
  /** Pre-selects the event type on the inquiry form. */
  eventType: EventTypeSlug;
  image: ImageAsset;
};

export type FeatureIcon = "design" | "details" | "execution";

export type Feature = { title: string; text: string; icon: FeatureIcon };

export type ProcessIcon = "vision" | "design" | "details" | "celebrate";

export type ProcessStep = { title: string; text: string; icon: ProcessIcon };

export type HomePackage = { name: string; text: string; image: ImageAsset };

/** One before/after pair in the transformation slider. */
export type Transformation = {
  label: string;
  before: ImageAsset;
  after: ImageAsset;
  /**
   * Sample only: no real "before" photo yet, so `before` is the after photo dimmed and greyed.
   * Never shown on the live site — replace with a real photo of the empty venue.
   */
  simulateBefore?: boolean;
};

/** One count-up figure in the stats band. */
export type Stat = { value: number; suffix?: string; label: string };

/** Popup shown once on the homepage. */
export type HomeOffer = {
  /** Turn the popup off without deleting the content. */
  enabled: boolean;
  eyebrow: string;
  heading: string;
  body: string;
  /** The deal in a few characters, shown large in the round seal on the photo, e.g. "15%". */
  highlight?: string;
  /** Small line under the highlight in the seal, e.g. "off décor". */
  highlightNote?: string;
  /** Up to three short "what you get" points. */
  perks?: string[];
  /** Small print, e.g. "Valid for bookings until 31 December". */
  note?: string;
  cta: string;
  image: ImageAsset;
  /** Change this when the offer changes, so visitors who closed the old one see the new one. */
  id: string;
  /** Sample copy: shown (labelled) in development only, never on the live site. */
  placeholder?: boolean;
};

export type HomeContent = {
  hero: { eyebrow: string; headline: string; intro: string; image: ImageAsset };
  about: { eyebrow: string; heading: string; body: string; image: ImageAsset; features: Feature[] };
  services: { eyebrow: string; heading: string; items: HomeService[] };
  gallery: { eyebrow: string; heading: string; intro: string };
  touch: { eyebrow: string; heading: string; body: string; image: ImageAsset; items: string[] };
  packages: { eyebrow: string; heading: string; intro: string; items: HomePackage[] };
  process: { eyebrow: string; heading: string; steps: ProcessStep[] };
  testimonials: { eyebrow: string; heading: string; intro: string };
  social: { heading: string; images: ImageAsset[] };
  cta: { heading: string; body: string; image: ImageAsset };
  offer: HomeOffer;
  /** Placeholder sections are shown (labelled) in development and hidden on the live site. */
  transform: { eyebrow: string; heading: string; intro: string; items: Transformation[]; placeholder?: boolean };
  stats: { items: Stat[]; placeholder?: boolean };
};
