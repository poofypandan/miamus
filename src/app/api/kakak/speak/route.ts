import { after, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { handleSpeak, handleVoiceCheck, type ReserveResult } from "@/lib/kakak/app-voice-server";

/**
 * Kakak's own voice (read replies aloud). One reply, shaped for the ear on
 * the phone, becomes speech with ElevenLabs and streams back; the key stays
 * here. Everything but the wiring is in src/lib/kakak/app-voice-server.ts.
 *
 * Off — and the phone reads aloud itself, exactly as before — until the
 * server has ELEVENLABS_API_KEY and KAKAK_VOICE_ID.
 *
 * Who may call it is decided by the database with the caller's own JWT:
 * kakak_voice_reserve (migrations/173) lets in only an admin of the
 * household where Kakak is allowed and switched on, the people /api/kakak
 * lets in, and holds the reply's characters against the household's day;
 * kakak_voice_release gives them back when no audio reached the phone. Logs carry the
 * language and the length, never the words.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The audio streams for a few seconds; deleting it from ElevenLabs' history
// afterwards waits up to 13 seconds more.
export const maxDuration = 30;

async function signedInUser(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function GET() {
  return handleVoiceCheck({ env: process.env, userId: signedInUser });
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** kakak_voice_reserve (migrations/173), as the caller with their own JWT. */
async function reserve(supabase: Supabase, householdId: string, chars: number, dailyChars: number): Promise<ReserveResult> {
  const { data, error } = await supabase.rpc("kakak_voice_reserve", {
    p_household: householdId,
    p_chars: chars,
    p_daily_chars: dailyChars,
  });
  if (error) {
    // PGRST202 / 42883: a database without migrations 172 and 173 yet. The
    // voice stays off rather than unmetered.
    console.error("kakak voice: budget not checked", error.code);
    return { ok: false, reason: "unavailable" };
  }
  const result = data as { ok?: boolean; reason?: string; hold?: unknown } | null;
  if (result?.ok && typeof result.hold === "string") return { ok: true, hold: result.hold };
  const reason = result?.reason;
  return {
    ok: false,
    reason: reason === "budget" || reason === "off" || reason === "not_allowed" ? reason : "not_admin",
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  return handleSpeak(request, {
    env: process.env,
    userId: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    reserve: (householdId, chars, dailyChars) => reserve(supabase, householdId, chars, dailyChars),
    release: async (householdId, hold) => {
      const { data, error } = await supabase.rpc("kakak_voice_release", { p_household: householdId, p_hold: hold });
      if (error || !(data as { ok?: boolean } | null)?.ok) console.error("kakak voice: characters not given back", error?.code ?? "-");
    },
    settle: async (householdId, hold) => {
      const { error } = await supabase.rpc("kakak_voice_settle", { p_household: householdId, p_hold: hold });
      if (error) console.error("kakak voice: hold not settled", error.code);
    },
    fetch,
    later: (task) => after(task),
    signal: request.signal,
  });
}
