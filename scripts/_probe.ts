import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const probes: [string, string][] = [
  ["quotations", "id,customer:customers!inner(id,name),booking:bookings(id,number)"],
  ["quotations", "id,lead:leads(id,number),inquiry:inquiries(id,number),pkg:packages(id,name),coupon:coupons(code)"],
  ["bookings", "id,customer:customers!inner(id,name),event:events!inner(id,title)"],
  ["bookings", "id,quote:quotations(id,number),pkg:packages(id,name)"],
  ["events", "id,customer:customers(id,name),booking:bookings(id,number)"],
  ["event_tasks", "id,e:events(id,title),s:staff(name),u:profiles!assignee_user_id(full_name)"],
  ["event_notes", "id,p:profiles(full_name)"],
  ["staff_assignments", "id,s:staff!inner(id,name),e:events!inner(id,title)"],
  ["vendor_assignments", "id,v:vendors!inner(id,name),e:events!inner(title)"],
  ["inventory_reservation_items", "id,item:inventory_items!inner(id,name),r:inventory_reservations!inner(e:events!inner(id,title))"],
  ["event_timeline", "id,s:staff(name)"],
  ["payments", "id,customer:customers!inner(id,name),booking:bookings!inner(id,number),inv:invoices(id,number)"],
  ["invoices", "id,customer:customers!inner(id,name),booking:bookings!inner(id,number,events(title))"],
  ["expenses", "id,cat:expense_categories!inner(name),vendor:vendors(id,name),event:events(id,title)"],
  ["inventory_items", "id,cat:inventory_categories(name),supplier:vendors(id,name)"],
  ["inventory_movements", "id,p:profiles(full_name),e:events(id,title)"],
  ["package_items", "id,pkg:packages!inner(id,name)"],
  ["packages", "id,items:package_items(label)"],
  ["bookings", "id,c:customers!inner(name),e:events(title)"],
];
(async () => {
  for (const [t, s] of probes) {
    const { error } = await db.from(t).select(s).limit(1);
    console.log(error ? `FAIL ${t}: ${s}\n     ${error.code} ${error.message} ${error.hint ?? ""}`.slice(0, 400) : `ok   ${t}: ${s.slice(0, 80)}`);
  }
  const o = await db.from("bookings").select("id,event:events!inner(event_date)").order("event(event_date)").limit(1);
  console.log(o.error ? `FAIL order by embed: ${o.error.message}` : "ok   order by event(event_date)");
})();
