import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PackageDetail from "@/components/packages/PackageDetail";
import { getPackage, getPackages } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

const SLUG = /^[a-z0-9-]{1,80}$/;

export async function generateStaticParams() {
  return (await getPackages()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/packages/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const pkg = SLUG.test(slug) ? await getPackage(slug) : null;
  if (!pkg) return {};
  return pageMetadata({
    title: pkg.seoTitle || `${pkg.name} Decoration Package`,
    description: pkg.seoDescription || pkg.summary || `The ${pkg.name} décor package by Timeless Ties Events & Decor, Kathmandu.`,
    path: `/packages/${pkg.slug}`,
    image: pkg.image,
  });
}

/** A published package's own page. Drafts and archived packages return 404. */
export default async function PackagePage({ params }: PageProps<"/packages/[slug]">) {
  const { slug } = await params;
  const pkg = SLUG.test(slug) ? await getPackage(slug) : null;
  if (!pkg) notFound();
  return <PackageDetail pkg={pkg} />;
}
