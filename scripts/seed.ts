/**
 * Seed the database (privileged connection — run by developers / on first deploy).
 *
 *   npm run db:seed            website content imported from src/data (safe to re-run; it only
 *                              fills an empty site and never overwrites admin edits)
 *
 * Reference data (roles, permissions, stages, categories, automation rules) is created by the
 * migrations themselves. `npm run db:seed:sql` writes the result to supabase/seed.sql for
 * `supabase db reset`.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { DEFAULT_QUOTE_TERMS } from "../src/lib/defaults";
import { catalogueSections, offerings, PRICE_NOTE, priceLists } from "../src/data/catalogue";
import { eventTypes } from "../src/data/event-types";
import { faqs } from "../src/data/faqs";
import { galleryItems } from "../src/data/gallery";
import { homeContent } from "../src/data/home";
import { images } from "../src/data/images";
import { budgetOptions, guestCountOptions } from "../src/data/inquiry";
import { decorationOptions, inquiryServiceOptions, services } from "../src/data/services";
import { homeSeo, siteSettings } from "../src/data/site";
import { testimonials } from "../src/data/testimonials";
import type { ImageAsset } from "../src/types";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const client = postgres(url, { max: 1, onnotice: () => {}, prepare: !url.includes(":6543") });
export const db = drizzle(client, { schema, casing: "snake_case" });
export type SeedDb = typeof db;

/* ───────── Media: register the photos that ship in /public ───────── */

const mediaIds = new Map<string, string>();

export async function media(asset: ImageAsset | undefined, folder: string) {
  if (!asset) return null;
  const cached = mediaIds.get(asset.src);
  if (cached) return cached;
  const [row] = await db
    .insert(schema.media)
    .values({
      bucket: "static", // files in /public — the media library can replace them with uploads
      path: asset.src,
      url: asset.src,
      filename: asset.src.split("/").pop()!,
      title: asset.src
        .split("/")
        .pop()!
        .replace(/\.\w+$/, "")
        .replace(/-/g, " "),
      alt: asset.alt,
      mime: asset.src.endsWith(".png") ? "image/png" : "image/jpeg",
      width: asset.width,
      height: asset.height,
      folder,
      tags: asset.focus ? [`focus:${asset.focus}`] : [],
    })
    .onConflictDoUpdate({ target: [schema.media.bucket, schema.media.path], set: { alt: asset.alt } })
    .returning({ id: schema.media.id });
  mediaIds.set(asset.src, row.id);
  return row.id;
}

/** Keep the image object in JSON content, remembering the media id it came from. */
const withMedia = async (asset: ImageAsset, folder: string) => ({ ...asset, mediaId: await media(asset, folder) });

async function walkImages(node: unknown): Promise<unknown> {
  if (Array.isArray(node)) return Promise.all(node.map(walkImages));
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.src === "string" && typeof obj.width === "number") return withMedia(obj as ImageAsset, "Website");
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = await walkImages(v);
    return out;
  }
  return node;
}

async function setting(key: string, value: unknown, isPublic: boolean) {
  await db.insert(schema.siteSettings).values({ key, value, isPublic }).onConflictDoNothing({ target: schema.siteSettings.key });
}

/* ───────── Website content ───────── */

async function seedWebsite() {
  const [existing] = await db.select().from(schema.siteSettings).where(eq(schema.siteSettings.key, "business"));
  if (existing) {
    console.log("· Website content already present — skipped");
    return;
  }
  for (const asset of Object.values(images)) await media(asset, "Website");

  const { socials, url: _url, ...business } = siteSettings;
  await setting(
    "business",
    {
      ...business,
      logo: business.logo && (await withMedia(business.logo, "Brand")),
      logoOnDark: business.logoOnDark && (await withMedia(business.logoOnDark, "Brand")),
      currency: "NPR",
      timezone: "Asia/Kathmandu",
    },
    true,
  );
  for (const [i, s] of socials.entries()) {
    await db.insert(schema.socialLinks).values({ platform: s.platform, label: s.label, url: s.url, handle: s.handle, position: i }).onConflictDoNothing();
  }

  // Homepage: one row per section, in display order
  const order = ["hero", "about", "services", "gallery", "touch", "transform", "packages", "stats", "process", "testimonials", "social", "cta", "offer"];
  const labels: Record<string, string> = {
    hero: "Hero",
    about: "About",
    services: "Services",
    gallery: "Featured work",
    touch: "The Timeless Touch",
    transform: "Before & after",
    packages: "Packages",
    stats: "Stats",
    process: "Process",
    testimonials: "Testimonials",
    social: "Social",
    cta: "Final call to action",
    offer: "Offer popup",
  };
  const home = (await walkImages(structuredClone(homeContent))) as Record<string, unknown>;
  for (const [position, key] of order.entries()) {
    await db.insert(schema.homepageSections).values({ key, label: labels[key], content: home[key] as object, position, status: "PUBLISHED" }).onConflictDoNothing();
  }

  await setting(
    "about",
    {
      eyebrow: "Our studio",
      title: "About Us",
      subtitle: "Wedding décor · Event styling · Celebrations",
      heading: "Celebrations, designed with care.",
      paragraphs: [
        "Timeless Ties Events & Decor is a Kathmandu-based décor studio. From intimate family functions to full wedding celebrations, we design and build the setting so you can focus on the people who matter.",
        "Every event starts with your ideas, your traditions and your budget. We turn them into a setup that feels personal — and we take care of it from the first sketch to the final finishing touch.",
      ],
      image: await withMedia(images.coupleArchway, "Website"),
      ctaImage: await withMedia(images.mandapBallroom, "Website"),
    },
    true,
  );
  await setting("faqs", faqs, true);
  await setting("catalogue_meta", { offerings: [...offerings], priceNote: PRICE_NOTE }, true);
  await setting("seo_global", { homeTitle: homeSeo.title, homeDescription: homeSeo.description, keywords: homeSeo.keywords }, true);
  await setting(
    "inquiry_options",
    { services: [...inquiryServiceOptions], decorationOptions: [...decorationOptions], guestCounts: [...guestCountOptions], budgets: [...budgetOptions] },
    true,
  );
  // Admin-only settings
  await setting("quotation_settings", { terms: DEFAULT_QUOTE_TERMS, termsVersion: "2026-10", taxRate: 0, depositPercent: 50, validityDays: 14 }, false);
  await setting("invoice_settings", { dueDays: 7, notes: "Thank you for choosing Timeless Ties. Please quote the invoice number with your payment.", bankDetails: "" }, false);
  await setting("notification_settings", { emailNewInquiry: true, emailPaymentReceived: false }, false);

  for (const t of eventTypes) {
    const imageId = await media(t.image, "Website");
    if (imageId) await db.update(schema.eventTypes).set({ imageId }).where(eq(schema.eventTypes.slug, t.slug));
  }

  for (const s of services) {
    await db
      .insert(schema.services)
      .values({ slug: s.slug, name: s.name, summary: s.summary, description: s.description, imageId: await media(s.image, "Services"), featured: s.featured, position: s.order ?? 0 })
      .onConflictDoNothing();
  }

  for (const [i, t] of testimonials.entries()) {
    await db.insert(schema.testimonials).values({ customerName: t.customerName, eventType: t.eventType, quote: t.quote, rating: t.rating, placeholder: !!t.placeholder, status: "PUBLISHED", position: i });
  }

  for (const [i, g] of galleryItems.entries()) {
    const [album] = await db
      .insert(schema.galleryAlbums)
      .values({
        slug: g.id,
        title: g.title,
        category: g.category,
        location: g.location,
        eventDate: g.date,
        coverId: await media(g.image, "Gallery"),
        featured: g.featured,
        placeholder: !!g.placeholder,
        position: g.order ?? 100 + i,
      })
      .returning();
    for (const [j, img] of [g.image, ...(g.images ?? [])].entries()) {
      await db.insert(schema.galleryItems).values({ albumId: album.id, mediaId: (await media(img, "Gallery"))!, position: j });
    }
  }

  for (const section of catalogueSections) {
    const [row] = await db.insert(schema.catalogueSections).values({ slug: section.slug, name: section.name, intro: section.intro, position: section.order ?? 0 }).returning();
    for (const [j, item] of section.items.entries()) {
      await db.insert(schema.catalogueItems).values({
        key: item.id,
        sectionId: row.id,
        title: item.title,
        imageId: await media(item.image, "Catalogue"),
        priceAmount: item.price.amount,
        priceUnit: item.price.unit,
        priceFrom: !!item.price.from,
        position: j,
      });
    }
  }
  for (const [i, list] of priceLists.entries()) {
    await db.insert(schema.priceLists).values({
      slug: list.slug,
      name: list.name,
      rows: list.rows.map((r) => ({ label: r.label, amount: r.price.amount, unit: r.price.unit, from: r.price.from })),
      position: list.order ?? i,
    });
  }

  // The three homepage packages (prices to be set by the business in the admin)
  const tiers: Record<string, { summary: string; features: string[] }> = {
    Essential: { summary: "Small celebrations", features: ["Backdrop or stage décor", "Floral accents", "Basic lighting", "Setup & dismantling"] },
    Signature: { summary: "Elegant event styling", features: ["Designed stage & entrance", "Table centerpieces", "Uplighting", "Floral arrangements", "Coordination on the day"] },
    Bespoke: { summary: "Fully customised experiences", features: ["Concept & design consultation", "Custom stage, mandap & entrance", "Full venue styling", "Dedicated event coordinator"] },
  };
  for (const [i, p] of homeContent.packages.items.entries()) {
    await db
      .insert(schema.packages)
      .values({ slug: p.name.toLowerCase(), name: p.name, tier: p.name, summary: tiers[p.name]?.summary ?? p.text, features: tiers[p.name]?.features ?? [], imageId: await media(p.image, "Website"), featured: true, position: i })
      .onConflictDoNothing();
  }
  console.log("· Imported website content from src/data");
}

async function main() {
  const [roles] = await db.select().from(schema.roles).limit(1);
  if (!roles) throw new Error("Run the migrations first (npm run db:migrate).");
  await seedWebsite();
  await client.end();
}

main().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exit(1);
});
