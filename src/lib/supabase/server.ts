import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * A Supabase client for server components and route handlers, reading the
 * session from the request's cookies (Phase 86C).
 *
 * Separate from lib/supabase/client.ts because a server client must never be
 * a module-level singleton: one request's cookies would leak into the next.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a server component, where cookies are read-only.
            // The middleware refreshes the session, so this is safe to skip.
          }
        },
      },
    }
  );
}
