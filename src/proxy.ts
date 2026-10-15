import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/admin/login", "/admin/forgot-password", "/admin/reset-password", "/admin/accept-invitation", "/client/login"];

/**
 * Runs before private routes:
 *  1. refreshes the Supabase session cookie when the access token is about to expire;
 *  2. sends signed-out visitors to the login page (a fast first gate — every admin page and
 *     server action still checks the session and permissions, and RLS guards the data);
 *  3. adds no-index / no-frame / no-store headers.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname, search } = request.nextUrl;

  let signedIn = false;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    // getClaims() verifies the JWT and refreshes the session if needed
    const { data } = await supabase.auth.getClaims();
    signedIn = !!data?.claims?.sub;
  }

  const needsAuth = (pathname.startsWith("/admin") || pathname.startsWith("/client")) && !PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (needsAuth && !signedIn) {
    const login = new URL(pathname.startsWith("/client") ? "/client/login" : "/admin/login", request.url);
    if (pathname !== "/admin" && pathname !== "/client") login.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(login);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Frame-Options", "DENY");
  // Email-link pages carry one-time tokens in the URL: never send it on, even to our own assets
  const linkPage = pathname.startsWith("/admin/accept-invitation") || pathname.startsWith("/auth/");
  response.headers.set("Referrer-Policy", linkPage ? "no-referrer" : "same-origin");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/client/:path*", "/quote/:path*", "/auth/:path*", "/api/admin/:path*"],
};
