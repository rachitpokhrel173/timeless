"use client";

import { useEffect } from "react";
import { ACCEPT_INVITATION_PATH } from "@/lib/auth/redirects";

/**
 * Supabase's default invitation email can return to the Site URL (e.g. /admin) with the session or
 * an error in the URL fragment; signed-out visitors are then sent here with the fragment intact.
 * Hand it to the acceptance page, which knows how to read it.
 */
export default function EmailLinkForwarder() {
  useEffect(() => {
    const hash = window.location.hash;
    if (/[#&](access_token|error_code)=/.test(hash)) window.location.replace(`${ACCEPT_INVITATION_PATH}${hash}`);
  }, []);
  return null;
}
