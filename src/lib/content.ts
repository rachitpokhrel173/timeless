import "server-only";
import { unstable_cache } from "next/cache";
import { asAnon, cols, many, maybe, schema, tbl, type DB, type Row } from "@/db";
import { legalLinks, navLinks, siteSettings as defaultSite } from "@/data/site";
import { toImageAsset } from "@/server/media";
import type { CatalogueSection, EventType, EventTypeSlug, GalleryItem, HomeContent, ImageAsset, NavLink, PriceList, PublicPackage, Service, SiteSettings, SocialLink, Testimonial } from "@/types";
import { showPlaceholders } from "./utils";

/*
 * Content access layer for the public website.
 *
 * Every query runs as Supabase's `anon` role, so Row Level Security guarantees the website can
 * only ever read published content and public settings — drafts and CRM data are invisible here
 * even if a query were wrong. Results are cached under the "cms" tag; admin saves call
 * updateTag("cms") so changes appear immediately.
 */

export const CMS_TAG = "cms";
const cached = <A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: string) => unstable_cache(fn, ["cms", key], { tags: [CMS_TAG], revalidate: 3600 });

type Media = { url: string | null; alt: string; width: number | null; height: number | null; tags: string[] };
/** Embedded media row through a foreign-key column, e.g. media("image", "image_id"). */
const media = (alias: string, fk: string, inner = false) => `${alias}:media!${fk}${inner ? "!inner" : ""}(url,alt,width,height,tags)`;

async function setting<T>(conn: DB, key: string): Promise<T | undefined> {
  const row = await maybe<{ value: unknown }>(conn.from(tbl(schema.siteSettings)).select("value").eq("key", key));
  return row?.value as T | undefined;
}

/* ───────── Business details ───────── */

export type AboutContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  heading: string;
  paragraphs: string[];
  image: ImageAsset;
  ctaImage: ImageAsset;
  /** Second block ("One team, start to finish") — added by 00025 from the copy that was hard-coded. */
  team?: { heading: string; paragraphs: string[]; images: ImageAsset[] };
};
export type BusinessSettings = Omit<SiteSettings, "socials" | "url"> & { currency?: string; timezone?: string };

/** Business details for the site chrome. `override` is a draft being previewed (Website CMS → Contact). */
export async function buildSiteSettings(conn: DB, override?: Partial<BusinessSettings>): Promise<SiteSettings & { currency: string; timezone: string }> {
      const [stored, socials] = await Promise.all([
        setting<BusinessSettings>(conn, "business"),
        many<Row<typeof schema.socialLinks>>(conn.from(tbl(schema.socialLinks)).select(cols(schema.socialLinks)).order("position")),
      ]);
      const business = override ? { ...stored, ...override } : stored;
      return {
        ...defaultSite,
        ...business,
        currency: business?.currency ?? "NPR",
        timezone: business?.timezone ?? "Asia/Kathmandu",
        url: defaultSite.url,
        socials: socials.length
          ? socials.map((s) => ({ platform: s.platform as SocialLink["platform"], label: s.label, url: s.url, handle: s.handle ?? undefined }))
          : defaultSite.socials,
      };
}

export const getSiteSettings = cached(async () => asAnon((conn) => buildSiteSettings(conn)), "site");

/* ───────── Navigation & footer (Website CMS → Navigation) ───────── */

export type NavigationContent = { links: NavLink[]; footerText: string; copyright: string };

/**
 * Only these public destinations can be linked from the menu, so a menu edit can never point
 * visitors at admin, API or private pages. Service and package pages are allowed by slug.
 */
export const NAV_DESTINATION = /^\/(?:(?:about|services|gallery|catalogue|contact|inquiry|packages)(?:\/[a-z0-9-]{1,80})?)?(?:#[a-z0-9-]{1,40})?$/;
export const isNavDestination = (href: string) => NAV_DESTINATION.test(href) && !/^\/(about|gallery|catalogue|contact|inquiry)\//.test(href);

export function buildNavigation(value: Partial<NavigationContent> | undefined): NavigationContent & { legal: NavLink[] } {
  const links = (value?.links ?? []).filter((l) => l?.label?.trim() && isNavDestination(l.href));
  return {
    links: links.length ? links : navLinks,
    footerText: value?.footerText ?? "",
    copyright: value?.copyright ?? "",
    legal: legalLinks,
  };
}

export const navigationFor = async (conn: DB, override?: Partial<NavigationContent>) => buildNavigation(override ?? (await setting<Partial<NavigationContent>>(conn, "navigation")));
export const getNavigation = cached(async () => asAnon((conn) => navigationFor(conn)), "navigation");

export const homeSectionOrder = (conn: DB) =>
  many<{ key: string; position: number }>(conn.from(tbl(schema.homepageSections)).select("key,position").eq("status", "PUBLISHED").neq("key", "offer").order("position"));

/** Published homepage sections in display order (Website → Homepage controls this). */
export const getHomeSections = cached(
  async () => asAnon((conn) => homeSectionOrder(conn)),
  "home-sections",
);

/**
 * Homepage content. The public site reads it as `anon` (RLS: published only); the draft preview
 * reads it with the service client and lays the drafts (`overlay`) over the published copy.
 */
export async function buildHomeContent(conn: DB, overlay?: Map<string, unknown>): Promise<HomeContent> {
      const [sections, packages] = await Promise.all([
        many<{ key: string; content: unknown }>(conn.from(tbl(schema.homepageSections)).select("key,content").eq("status", "PUBLISHED")),
        many<{ name: string; summary: string | null; image: Media | null }>(
          conn
            .from(tbl(schema.packages))
            .select(`name,summary,${media("image", "image_id")}`)
            .eq("status", "PUBLISHED")
            .eq("featured", true)
            .order("position")
            .limit(3),
        ),
      ]);
      if (!sections.length) throw new Error("Homepage content is missing — run the seed (see README).");
      const home = Object.fromEntries(sections.map((s) => [s.key, overlay?.get(s.key) ?? s.content])) as unknown as HomeContent;
      // Unpublished sections aren't returned by RLS; give components empty-but-valid shapes
      home.offer ??= { enabled: false } as HomeContent["offer"];
      // Homepage package cards come from Packages (featured + published) so they stay in sync with sales
      const items = packages
        .map((p) => ({ name: p.name, text: p.summary ?? "", image: toImageAsset(p.image, p.name) }))
        .filter((p): p is { name: string; text: string; image: ImageAsset } => !!p.image);
      if (home.packages) home.packages = { ...home.packages, items: items.length ? items : (home.packages.items ?? []) };
      return home;
}

export const getHomeContent = cached(async () => asAnon((conn) => buildHomeContent(conn)), "home");

export const getAboutFor = async (conn: DB) => ((await setting<AboutContent>(conn, "about")) ?? ({} as AboutContent));
export const getAboutContent = cached(async () => asAnon(getAboutFor), "about");
export const getFaqsFor = async (conn: DB) => (await setting<{ q: string; a: string }[]>(conn, "faqs")) ?? [];
export const getFaqs = cached(async () => asAnon(async (conn) => (await setting<{ q: string; a: string }[]>(conn, "faqs")) ?? []), "faqs");
export const getCatalogueMeta = cached(
  async () => asAnon(async (conn) => (await setting<{ offerings: string[]; priceNote: string }>(conn, "catalogue_meta")) ?? { offerings: [], priceNote: "" }),
  "catalogue-meta",
);
export const getInquiryOptions = cached(
  async () =>
    asAnon(
      async (conn) =>
        (await setting<{ services: string[]; decorationOptions: string[]; guestCounts: string[]; budgets: string[] }>(conn, "inquiry_options")) ?? {
          services: [],
          decorationOptions: [],
          guestCounts: [],
          budgets: [],
        },
    ),
  "inquiry-options",
);
export const getSeoGlobal = cached(
  async () => asAnon(async (conn) => (await setting<{ homeTitle: string; homeDescription: string; keywords: string[] }>(conn, "seo_global")) ?? null),
  "seo-global",
);

/** Admin overrides for a page's SEO, if any. */
export const getPageSeo = cached(
  async (path: string) =>
    asAnon(async (conn) => {
      const row = await maybe<{ title: string | null; description: string | null; noindex: boolean; ogTitle: string | null; ogDescription: string | null; canonicalPath: string | null; image: Media | null }>(
        conn
          .from(tbl(schema.seoSettings))
          .select(`title,description,noindex,ogTitle:og_title,ogDescription:og_description,canonicalPath:canonical_path,${media("image", "og_image_id")}`)
          .eq("path", path),
      );
      return row
        ? { title: row.title, description: row.description, noindex: row.noindex, ogTitle: row.ogTitle, ogDescription: row.ogDescription, canonicalPath: row.canonicalPath, image: toImageAsset(row.image) }
        : null;
    }),
  "page-seo",
);

/* ───────── Collections (RLS returns published rows only) ───────── */

type ServiceRow = Row<typeof schema.services> & { image: Media | null };

/** Images for a list of media ids, in that order (public buckets only, never deleted files). */
async function imagesById(conn: DB, ids: string[], fallbackAlt: string) {
  if (!ids.length) return [];
  const rows = await many<Media & { id: string }>(
    conn.from(tbl(schema.media)).select("id,url,alt,width,height,tags").in("id", ids).in("bucket", ["public-media", "static"]).is("deleted_at", null),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => toImageAsset(byId.get(id), fallbackAlt)).filter((x): x is ImageAsset => !!x);
}

const toService = (s: ServiceRow): Service => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  summary: s.summary,
  description: s.description,
  featured: s.featured,
  order: s.position,
  image: toImageAsset(s.image, s.name)!,
  category: s.category ?? undefined,
  startingPrice: s.startingPrice ?? undefined,
  seoTitle: s.seoTitle ?? undefined,
  seoDescription: s.seoDescription ?? undefined,
});

export const getServices = cached(
  async ({ featured }: { featured?: boolean } = {}): Promise<Service[]> =>
    asAnon(async (conn) => {
      let query = conn.from(tbl(schema.services)).select(`${cols(schema.services)},${media("image", "image_id")}`).eq("status", "PUBLISHED");
      if (featured !== undefined) query = query.eq("featured", featured);
      const rows = await many<ServiceRow>(query.order("position"));
      return rows.map(toService).filter((s) => s.image);
    }),
  "services",
);

/**
 * One service with its gallery and "what's included" list. The public page reads published
 * services as `anon`; the draft preview passes the service client and `anyStatus`.
 */
export async function serviceBySlug(conn: DB, slug: string, { anyStatus = false } = {}): Promise<Service | null> {
  let q = conn.from(tbl(schema.services)).select(`${cols(schema.services)},${media("image", "image_id")}`).eq("slug", slug);
  if (!anyStatus) q = q.eq("status", "PUBLISHED");
  const row = await maybe<ServiceRow>(q);
  if (!row) return null;
  const [gallery, items] = await Promise.all([
    imagesById(conn, row.galleryIds ?? [], row.name),
    many<{ title: string; description: string | null }>(conn.from(tbl(schema.serviceItems)).select("title,description").eq("service_id", row.id).order("position")),
  ]);
  const service = toService(row);
  return service.image ? { ...service, gallery, includes: items.map((i) => ({ title: i.title, description: i.description ?? undefined })) } : null;
}

export const getService = cached(async (slug: string) => asAnon((conn) => serviceBySlug(conn, slug)), "service");

type PackageRow = Row<typeof schema.packages> & { image: Media | null };

/** One package with its gallery, contents and linked services (published only unless `anyStatus`). */
export async function packageBySlug(conn: DB, slug: string, { anyStatus = false } = {}): Promise<PublicPackage | null> {
  let q = conn.from(tbl(schema.packages)).select(`${cols(schema.packages)},${media("image", "image_id")}`).eq("slug", slug);
  if (!anyStatus) q = q.eq("status", "PUBLISHED");
  const p = await maybe<PackageRow>(q);
  if (!p) return null;
  const [gallery, items, services] = await Promise.all([
    imagesById(conn, p.galleryIds ?? [], p.name),
    many<{ label: string; quantity: number }>(conn.from(tbl(schema.packageItems)).select("label,quantity").eq("package_id", p.id).order("position")),
    p.serviceIds?.length
      ? many<{ slug: string; name: string }>(conn.from(tbl(schema.services)).select("slug,name").in("id", p.serviceIds).eq("status", "PUBLISHED").order("position"))
      : Promise.resolve([]),
  ]);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    tier: p.tier,
    category: p.category,
    summary: p.summary,
    description: p.description,
    price: p.price,
    priceFrom: p.priceFrom,
    features: p.features.length ? p.features : items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.label}` : i.label)),
    addOns: Array.isArray(p.addOns) ? p.addOns.filter((a) => a?.label) : [],
    image: toImageAsset(p.image, p.name),
    gallery,
    services,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
  };
}

export const getPackage = cached(async (slug: string) => asAnon((conn) => packageBySlug(conn, slug)), "package");

export const getPackages = cached(
  async () =>
    asAnon(async (conn) => {
      const [rows, items] = await Promise.all([
        many<Row<typeof schema.packages> & { image: Media | null }>(
          conn
            .from(tbl(schema.packages))
            .select(`${cols(schema.packages)},${media("image", "image_id")}`)
            .eq("status", "PUBLISHED")
            .order("position"),
        ),
        many<Row<typeof schema.packageItems>>(conn.from(tbl(schema.packageItems)).select(cols(schema.packageItems)).order("position")),
      ]);
      return rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        tier: p.tier,
        summary: p.summary,
        description: p.description,
        price: p.price,
        priceFrom: p.priceFrom,
        features: p.features.length ? p.features : items.filter((i) => i.packageId === p.id).map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.label}` : i.label)),
        image: toImageAsset(p.image, p.name),
      }));
    }),
  "packages",
);

export const getEventTypes = cached(
  async ({ home }: { home?: boolean } = {}): Promise<EventType[]> =>
    asAnon(async (conn) => {
      const rows = await many<Row<typeof schema.eventTypes> & { image: Media | null }>(
        conn
          .from(tbl(schema.eventTypes))
          .select(`${cols(schema.eventTypes)},${media("image", "image_id")}`)
          .eq("published", true)
          .order("position"),
      );
      const all = rows.map((t) => ({ id: t.slug, slug: t.slug as EventTypeSlug, name: t.name, image: toImageAsset(t.image, t.name), showOnHome: t.showOnHome }));
      return home ? all.filter((e) => e.showOnHome && e.image) : all;
    }),
  "event-types",
);

export const getGalleryItems = cached(
  async ({ featured, limit }: { featured?: boolean; limit?: number } = {}): Promise<GalleryItem[]> =>
    asAnon(async (conn) => {
      let query = conn.from(tbl(schema.galleryAlbums)).select(`${cols(schema.galleryAlbums)},${media("cover", "cover_id")}`).eq("status", "PUBLISHED");
      if (featured !== undefined) query = query.eq("featured", featured);
      let albums = await many<Row<typeof schema.galleryAlbums> & { cover: Media | null }>(query.order("position").order("created_at").limit(500));
      // Sample albums always show in development. In production they're hidden as soon as a real
      // album exists, and until then they stand in so the gallery is never empty.
      if (!showPlaceholders && albums.some((a) => !a.placeholder)) albums = albums.filter((a) => !a.placeholder);
      if (limit !== undefined) albums = albums.slice(0, limit);
      if (!albums.length) return [];
      const photos = await many<{ albumId: string; image: Media }>(
        conn
          .from(tbl(schema.galleryItems))
          .select(`albumId:album_id,${media("image", "media_id", true)}`)
          .in(
            "album_id",
            albums.map((x) => x.id),
          )
          .eq("kind", "IMAGE")
          .eq("status", "PUBLISHED")
          .order("position"),
      );
      return albums
        .map((album) => {
          const cover = album.cover;
          const extra = photos
            .filter((p) => p.albumId === album.id && p.image.url !== cover?.url)
            .map((p) => toImageAsset(p.image, album.title)!)
            .filter(Boolean);
          const item: Omit<GalleryItem, "image"> & { image?: ImageAsset } = {
            id: album.slug,
            title: album.title,
            category: album.category,
            location: album.location ?? undefined,
            date: album.eventDate ?? undefined,
            image: toImageAsset(cover, album.title) ?? extra[0],
            images: extra.length ? extra : undefined,
            featured: album.featured,
            order: album.position,
            placeholder: album.placeholder,
          };
          return item;
        })
        .filter((g): g is GalleryItem => !!g.image);
    }),
  "gallery-v2", // bumped when gallery rows are changed straight in the database, which skips refreshSite()
);

export const getCatalogue = cached(
  async (): Promise<CatalogueSection[]> =>
    asAnon(async (conn) => {
      const [sections, items] = await Promise.all([
        many<Row<typeof schema.catalogueSections>>(conn.from(tbl(schema.catalogueSections)).select(cols(schema.catalogueSections)).order("position")),
        many<Row<typeof schema.catalogueItems> & { image: Media | null }>(
          conn
            .from(tbl(schema.catalogueItems))
            .select(`${cols(schema.catalogueItems)},${media("image", "image_id")}`)
            .order("position"),
        ),
      ]);
      return sections.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        intro: s.intro,
        order: s.position,
        items: items
          .filter((i) => i.sectionId === s.id)
          .map((i) => ({
            id: i.key,
            title: i.title,
            image: toImageAsset(i.image, i.title)!,
            price: { amount: i.priceAmount ?? undefined, unit: i.priceUnit ?? undefined, from: i.priceFrom || undefined },
          }))
          .filter((i) => i.image),
      }));
    }),
  "catalogue-v4", // bumped when catalogue rows are changed straight in the database, which skips refreshSite()
);

export const getPriceLists = cached(
  async (): Promise<PriceList[]> =>
    asAnon(async (conn) => {
      const rows = await many<Row<typeof schema.priceLists>>(conn.from(tbl(schema.priceLists)).select(cols(schema.priceLists)).order("position"));
      return rows.map((l) => ({
        id: l.id,
        slug: l.slug,
        name: l.name,
        order: l.position,
        rows: l.rows.map((r) => ({ label: r.label, price: { amount: r.amount ?? undefined, unit: r.unit ?? undefined, from: r.from || undefined } })),
      }));
    }),
  "price-lists",
);

/** Published testimonials with the customer's consent; samples show in development only. */
export const getTestimonials = cached(
  async (): Promise<Testimonial[]> =>
    asAnon(async (conn) => {
      const rows = await many<Row<typeof schema.testimonials> & { photo: Media | null }>(
        conn
          .from(tbl(schema.testimonials))
          .select(`${cols(schema.testimonials)},${media("photo", "photo_id")}`)
          .eq("status", "PUBLISHED")
          .order("featured", { ascending: false })
          .order("position"),
      );
      return rows
        .filter((r) => (r.placeholder ? showPlaceholders : r.consent && r.reviewStatus === "APPROVED"))
        .map((r) => ({
          id: r.id,
          customerName: r.customerName,
          eventType: r.eventType,
          quote: r.quote,
          rating: r.rating ?? undefined,
          date: r.date ?? undefined,
          photo: toImageAsset(r.photo, r.customerName),
          placeholder: r.placeholder,
        }));
    }),
  "testimonials",
);

export type SocialPost = { id: string; image: ImageAsset; url: string; caption?: string };

/**
 * Latest social posts. Returns an empty list until an Instagram Graph API integration is
 * configured — the social section then falls back to portfolio images and never presents them
 * as live posts.
 */
export async function getSocialFeed(): Promise<SocialPost[]> {
  return [];
}
