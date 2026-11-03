"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";

/** Sign out of the staff portal and return to its sign-in page. */
export async function staffLogout() {
  const user = await getCurrentUser();
  if (user) await audit(user, "logout", "session", null, "Signed out (staff portal)");
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/staff/login");
}
