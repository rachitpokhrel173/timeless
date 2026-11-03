import { redirect } from "next/navigation";

/** Invoices now live in the combined Invoices & Payments workspace (filters carry over). */
export default async function InvoicesPage({ searchParams }: PageProps<"/admin/invoices">) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") sp.set(k, v);
  sp.set("tab", "invoices");
  redirect(`/admin/finance?${sp}`);
}
