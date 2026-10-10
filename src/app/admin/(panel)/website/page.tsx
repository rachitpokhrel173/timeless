import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Images, MessageSquareQuote, Package, Sparkles } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { relativeTime } from "@/lib/format";
import { listParams } from "@/lib/list";
import { mediaOptions } from "@/server/lookups";
import { CONTENT_STATUS, StatusBadge } from "@/components/admin/status";
import { Badge, buttonClass, Card, EmptyState, LinkButton, PageHeader, Table, Tabs, Td, Th } from "@/components/admin/ui";
import { DeleteSocialLinkButton, PageSeoButton, SectionControls, SeoGlobalForm, SocialLinkButton } from "./WebsiteClient";

export const metadata: Metadata = { title: "Website CMS" };

const CONTENT = [
  { key: "about", label: "About page", hint: "Story, photos and copy on /about" },
  { key: "faqs", label: "FAQs", hint: "Questions and answers on the contact page" },
  { key: "inquiry_options", label: "Inquiry form options", hint: "Services, décor styles, guest counts and budgets offered on the form" },
  { key: "catalogue_meta", label: "Catalogue intro", hint: "Offerings list and price note on /catalogue" },
] as const;

export default async function WebsitePage({ searchParams }: PageProps<"/admin/website">) {
  const user = await requirePage();
  if (!user.permissions.has("cms.view") && !user.permissions.has("cms.manage")) await requirePage("cms.view");
  const manage = user.permissions.has("cms.manage");
  const { str } = listParams(await searchParams);
  const tab = ["homepage", "content", "seo", "social"].includes(str("tab") ?? "") ? str("tab")! : "homepage";

  return (
    <>
      <PageHeader
        title="Website CMS"
        description="Everything visitors see on timelesstieevents.com.np. Changes go live as soon as you save."
        actions={
          <a href="/" target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <ExternalLink className="size-4" aria-hidden /> View website
          </a>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { href: "/admin/website/services", label: "Services", icon: Sparkles },
          { href: "/admin/packages", label: "Packages", icon: Package },
          { href: "/admin/website/gallery", label: "Gallery", icon: Images },
          { href: "/admin/website/testimonials", label: "Testimonials", icon: MessageSquareQuote },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-xl border border-a-border bg-a-surface p-4 font-medium hover:border-a-strong">
            <l.icon className="size-5 text-a-gold" aria-hidden />
            {l.label}
          </Link>
        ))}
      </div>
      <Tabs
        active={tab}
        items={[
          { key: "homepage", label: "Homepage", href: "/admin/website" },
          { key: "content", label: "Pages & forms", href: "/admin/website?tab=content" },
          { key: "seo", label: "SEO", href: "/admin/website?tab=seo" },
          { key: "social", label: "Social links", href: "/admin/website?tab=social" },
        ]}
      />
      {tab === "homepage" && <Homepage manage={manage} />}
      {tab === "content" && (
        <Card bodyClassName="p-0">
          <ul className="divide-y divide-a-border">
            {CONTENT.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{c.label}</p>
                  <p className="text-xs text-a-muted">{c.hint}</p>
                </div>
                <LinkButton href={`/admin/website/content/${c.key}`} size="sm">
                  {manage ? "Edit" : "View"}
                </LinkButton>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">Business details, logo & contact</p>
                <p className="text-xs text-a-muted">Name, phones, address and announcement bar — in Settings</p>
              </div>
              {user.permissions.has("settings.manage") && (
                <LinkButton href="/admin/settings" size="sm">
                  Open settings
                </LinkButton>
              )}
            </li>
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">Media library</p>
                <p className="text-xs text-a-muted">Upload and describe the photos used across the site</p>
              </div>
              <LinkButton href="/admin/media" size="sm">
                Open media
              </LinkButton>
            </li>
          </ul>
        </Card>
      )}
      {tab === "seo" && <Seo manage={manage} />}
      {tab === "social" && <Social manage={manage} />}
    </>
  );
}

async function Homepage({ manage }: { manage: boolean }) {
  const sections = await many<{ key: string; label: string; status: string; position: number; updatedAt: Date; content: { placeholder?: boolean; enabled?: boolean } }>(
    adminDb.from(tbl(schema.homepageSections)).select("key,label,status,position,updatedAt:updated_at,content").order("position"),
  );
  const ordered = sections.filter((s) => s.key !== "offer");
  const offer = sections.find((s) => s.key === "offer");
  return (
    <div className="space-y-4">
      <Card title="Homepage sections" description="Shown top to bottom in this order. Hidden sections are kept as drafts." bodyClassName="p-0">
        {ordered.length === 0 ? (
          <EmptyState compact title="No homepage content — run the seed (see README)" />
        ) : (
          <ul className="divide-y divide-a-border">
            {ordered.map((s, i) => (
              <li key={s.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="w-6 text-xs text-a-muted tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/website/sections/${s.key}`} className="font-medium hover:underline">
                    {s.label}
                  </Link>
                  <p className="text-xs text-a-muted">Edited {relativeTime(s.updatedAt)}</p>
                </div>
                {s.content?.placeholder && <Badge tone="warning">Sample content</Badge>}
                <StatusBadge map={CONTENT_STATUS} value={s.status} />
                {manage && <SectionControls sectionKey={s.key} published={s.status === "PUBLISHED"} first={i === 0} last={i === ordered.length - 1} />}
                <LinkButton href={`/admin/website/sections/${s.key}`} size="sm">
                  {manage ? "Edit" : "View"}
                </LinkButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {offer && (
        <Card title="Offer popup" description="Shown once to homepage visitors when enabled." actions={<LinkButton href="/admin/website/sections/offer" size="sm">{manage ? "Edit" : "View"}</LinkButton>}>
          <p className="text-[13px]">{offer.content?.enabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</p>
        </Card>
      )}
    </div>
  );
}

async function Seo({ manage }: { manage: boolean }) {
  const [global, pages, media] = await Promise.all([
    maybe<{ value: { homeTitle?: string; homeDescription?: string; keywords?: string[] } }>(adminDb.from(tbl(schema.siteSettings)).select("value").eq("key", "seo_global")),
    many<Row<typeof schema.seoSettings>>(adminDb.from(tbl(schema.seoSettings)).select(cols(schema.seoSettings)).order("path")),
    manage ? mediaOptions() : [],
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Defaults" description="Used on the homepage and wherever a page has no override.">
        {manage ? <SeoGlobalForm values={global?.value ?? {}} /> : <p className="text-[13px]">{global?.value.homeTitle}</p>}
      </Card>
      <Card title="Page overrides" description="Custom title and description for individual pages." bodyClassName="p-0" actions={manage && <PageSeoButton media={media} />}>
        {pages.length === 0 ? (
          <EmptyState compact title="No overrides — pages use their built-in SEO" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Page</Th>
                <Th>Title</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.path}>
                  <Td className="font-medium">
                    {p.path}
                    {p.noindex && (
                      <Badge tone="warning" className="ml-1.5">
                        noindex
                      </Badge>
                    )}
                  </Td>
                  <Td className="max-w-64 truncate text-xs">{p.title ?? "—"}</Td>
                  <Td className="text-right">{manage && <PageSeoButton media={media} values={p} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="px-4 pb-4 text-xs text-a-muted">The sitemap, robots.txt, canonical links and local-business structured data are generated automatically.</p>
      </Card>
    </div>
  );
}

async function Social({ manage }: { manage: boolean }) {
  const links = await many<Row<typeof schema.socialLinks>>(adminDb.from(tbl(schema.socialLinks)).select(cols(schema.socialLinks)).order("position"));
  return (
    <Card title="Social links" description="Shown in the footer and the Instagram section." bodyClassName="p-0" actions={manage && <SocialLinkButton />}>
      {links.length === 0 ? (
        <EmptyState compact title="No social links" />
      ) : (
        <ul className="divide-y divide-a-border">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {l.label} {l.handle && <span className="text-a-muted">{l.handle}</span>}
                </p>
                <p className="truncate text-xs text-a-muted">{l.url || "No link yet — hidden on the site"}</p>
              </div>
              {manage && (
                <span className="flex">
                  <SocialLinkButton values={l} />
                  <DeleteSocialLinkButton id={l.id} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
