/** ISO-8601 date string, e.g. "2026-11-24" or "2026-11-24T10:30:00Z". */
export type ISODate = string;

/**
 * An image the admin panel will eventually upload. `src` is a local path today
 * (`/images/...`) and can become a CDN/storage URL later without touching components.
 */
export type ImageAsset = {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** CSS object-position used when the image is cropped, e.g. "50% 30%". */
  focus?: string;
};

/** Fields shared by every admin-managed record. */
export type Managed = {
  id: string;
  /** Lower numbers show first. */
  order?: number;
  /** Hidden from the public site when false. Defaults to published. */
  published?: boolean;
  /**
   * Marks stock/sample content used before the client supplies real material.
   * Placeholder records are labelled in development and must be replaced before launch.
   */
  placeholder?: boolean;
};
