import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The owner-side auth guard, and the session refresh every Supabase SSR app
 * needs (Phase 86C).
 *
 * WHAT IS GUARDED, AND WHAT DELIBERATELY IS NOT
 * Only /dashboard and /onboarding. The landing page "/" is the staff screen —
 * the house rules, the "Jadwal" button, and the PWA's start_url — so putting
 * Google behind it would lock every staff phone out of the app on next open.
 * /staff and /join are likewise public by design: staff have no Google
 * account, they have an invite link (see lib/tenant.ts).
 *
 * The rules:
 *   no session          -> /login
 *   session, no house   -> /onboarding
 *   session, has house  -> through
 *   signed in on /login -> /dashboard
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          // Written to both: the request so this handler's own later reads
          // see the refreshed token, and the response so the browser keeps it.
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getUser(), not getSession(): it verifies the token with the auth server
  // rather than trusting whatever the cookie says.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    return NextResponse.redirect(url);
  };

  if (path.startsWith("/login")) {
    return user ? redirect("/dashboard") : response;
  }

  if (!user) return redirect("/login");

  // Signed in: they need a household before the dashboard means anything.
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership && path !== "/onboarding") return redirect("/onboarding");
  if (membership && path === "/onboarding") return redirect("/dashboard");

  return response;
}

export const config = {
  // Everything else — "/", /staff, /join, /auth/callback — stays public.
  matcher: ["/dashboard/:path*", "/onboarding", "/login"],
};
