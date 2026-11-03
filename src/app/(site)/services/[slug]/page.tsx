import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ServiceDetail from "@/components/services/ServiceDetail";
import { getService, getServices } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

const SLUG = /^[a-z0-9-]{1,80}$/;

export async function generateStaticParams() {
  return (await getServices()).map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const service = SLUG.test(slug) ? await getService(slug) : null;
  if (!service) return {};
  return pageMetadata({
    title: service.seoTitle || service.name,
    description: service.seoDescription || service.summary,
    path: `/services/${service.slug}`,
    image: service.image,
  });
}

/** A published service's own page. Drafts and archived services return 404. */
export default async function ServicePage({ params }: PageProps<"/services/[slug]">) {
  const { slug } = await params;
  const service = SLUG.test(slug) ? await getService(slug) : null;
  if (!service) notFound();
  return <ServiceDetail service={service} />;
}
