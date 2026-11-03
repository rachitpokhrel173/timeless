import { redirect } from "next/navigation";

/** Recording a payment happens in a dialog on the Outstanding balances tab (or any customer, booking, event or invoice). */
export default function NewPaymentPage() {
  redirect("/admin/finance?tab=outstanding");
}
