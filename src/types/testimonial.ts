import type { ImageAsset, ISODate, Managed } from "./common";

export type Testimonial = Managed & {
  customerName: string;
  eventType: string;
  quote: string;
  photo?: ImageAsset;
  date?: ISODate;
  /** Star rating 1–5, if the client collected one. */
  rating?: number;
};
