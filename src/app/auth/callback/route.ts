import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where Google sends the owner back to (Phase 86C). Trades the one-time code
 * for a session cookie, then hands off to the dashboard — the middleware
 * decides from there whether this account still needs onboarding.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("OAuth code exchange failed", error);
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
