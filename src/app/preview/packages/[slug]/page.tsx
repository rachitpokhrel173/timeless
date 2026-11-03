import { notFound } from "next/navigation";
import { adminDb } from "@/db";
import { packageBySlug } from "@/lib/content";
import PackageDetail from "@/components/packages/PackageDetail";

/** Any package (draft, published or archived) as its page would look. */
export default async function PreviewPackage({ params }: PageProps<"/preview/packages/[slug]">) {
  const { slug } = await params;
  const pkg = /^[a-z0-9-]{1,80}$/.test(slug) ? await packageBySlug(adminDb, slug, { anyStatus: true }) : null;
  if (!pkg) notFound();
  return <PackageDetail pkg={pkg} />;
}
