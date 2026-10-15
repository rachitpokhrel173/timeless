/**
 * Canonical public origin of the live website. Vercel serves www and redirects the bare domain to
 * it, so www is what Google must see in canonicals, the sitemap and robots.txt.
 */
export const PRODUCTION_ORIGIN = "https://www.timelesstieevents.com.np";
const BARE_DOMAIN = new URL(PRODUCTION_ORIGIN).host.replace(/^www\./, "");

const LOCAL_HOST = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

/**
 * The site's public origin (no trailing slash) for canonical URLs, the sitemap, share cards and
 * links in emails. Uses NEXT_PUBLIC_SITE_URL, except that a localhost value is ignored on the
 * production deployment — a copied .env.local must never put localhost into Google's index or
 * into invitation emails.
 */
export function resolveSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || "";
  const deployedProduction = process.env.VERCEL_ENV === "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
  // NEXT_PUBLIC_SITE_URL set to the bare domain would point every canonical at a redirect
  if (configured.replace(/^https?:\/\//, "") === BARE_DOMAIN) return PRODUCTION_ORIGIN;
  if (configured && !(deployedProduction && LOCAL_HOST.test(configured))) return configured;
  if (deployedProduction || process.env.NODE_ENV === "production") return PRODUCTION_ORIGIN;
  return "http://localhost:3000";
}
