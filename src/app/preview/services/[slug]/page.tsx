import { notFound } from "next/navigation";
import { adminDb } from "@/db";
import { serviceBySlug } from "@/lib/content";
import ServiceDetail from "@/components/services/ServiceDetail";

/** Any service (draft, published or archived) as its page would look. */
export default async function PreviewService({ params }: PageProps<"/preview/services/[slug]">) {
  const { slug } = await params;
  const service = /^[a-z0-9-]{1,80}$/.test(slug) ? await serviceBySlug(adminDb, slug, { anyStatus: true }) : null;
  if (!service) notFound();
  return <ServiceDetail service={service} />;
}
