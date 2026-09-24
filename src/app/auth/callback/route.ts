import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where Google sends the owner back to (Phase 86C). Trades the one-time code
 * for a session cookie, then hands off to the dashboard — the middleware
 * decides from there whether this account still needs onboarding.
 *
 * `next` carries a co-owner back to their invite (Phase 89). Only same-site
 * paths are honoured: anything else would make this an open redirect, which
 * is the classic way an OAuth callback gets turned into a phishing hop.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  // A single leading slash, and no "//" or "/\" that a browser would read as
  // a protocol-relative URL to another host.
  return /^\/(?!\/|\\)/.test(raw) ? raw : "/dashboard";
}
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("OAuth code exchange failed", error);
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
