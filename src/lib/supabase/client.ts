import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fetchWithWriteTimeout } from "./write-timeout";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// createBrowserClient (not createClient) since Phase 86C: it keeps the auth
// session in cookies rather than localStorage, which is the only way the
// middleware and server components can see who is signed in. Everything else
// about it — the anon key, the RLS posture — is unchanged, and it guards its
// own browser APIs, so importing this module during SSR is safe.
//
// null when env vars aren't configured yet — callers must go through the
// mock data provider in that case (see src/lib/data).
//
// Writes to tables give up after 20 seconds (Phase 161; see write-timeout.ts),
// so a save on a weak signal is queued on the phone instead of hanging.
export const supabase: SupabaseClient<Database> | null =
  supabaseUrl && supabaseAnonKey
    ? createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: { fetch: fetchWithWriteTimeout },
      })
    : null;
