import { redirect } from "next/navigation";

/** Payments now live in the combined Invoices & Payments workspace (filters carry over). */
export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") sp.set(k, v);
  sp.set("tab", sp.get("tab") === "reminders" ? "outstanding" : "payments");
  if (sp.get("show") === "void") sp.set("show", "reversed");
  redirect(`/admin/finance?${sp}`);
}
