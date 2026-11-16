import { after, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { handleSpeak, handleVoiceCheck, type SpendResult } from "@/lib/kakak/app-voice-server";

/**
 * Kakak's own voice (read replies aloud). One reply, shaped for the ear on
 * the phone, becomes speech with ElevenLabs and streams back; the key stays
 * here. Everything but the wiring is in src/lib/kakak/app-voice-server.ts.
 *
 * Off — and the phone reads aloud itself, exactly as before — until the
 * server has ELEVENLABS_API_KEY and KAKAK_VOICE_ID.
 *
 * Who may call it is decided by the database with the caller's own JWT:
 * kakak_voice_check (migrations/173) lets in only an admin of the household
 * where Kakak is allowed and switched on, the people /api/kakak lets in,
 * with characters left today; kakak_voice_spend (migrations/172) counts the
 * reply's characters once ElevenLabs has started sending its audio. Logs carry the
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

/**
 * kakak_voice_check (migrations/173, counts nothing) or kakak_voice_spend
 * (migrations/172, counts), as the caller with their own JWT.
 */
async function budgetCall(
  supabase: Supabase,
  fn: "kakak_voice_check" | "kakak_voice_spend",
  householdId: string,
  chars: number,
  dailyChars: number
): Promise<SpendResult> {
  const { data, error } = await supabase.rpc(fn, {
    p_household: householdId,
    p_chars: chars,
    p_daily_chars: dailyChars,
  });
  if (error) {
    // PGRST202 / 42883: a database without migrations 172 and 173 yet. The
    // voice stays off rather than unmetered.
    console.error("kakak voice: budget not checked", fn, error.code);
    return { ok: false, reason: "unavailable" };
  }
  const result = data as { ok?: boolean; reason?: string } | null;
  if (result?.ok) return { ok: true };
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
    check: (householdId, chars, dailyChars) => budgetCall(supabase, "kakak_voice_check", householdId, chars, dailyChars),
    spend: (householdId, chars, dailyChars) => budgetCall(supabase, "kakak_voice_spend", householdId, chars, dailyChars),
    fetch,
    later: (task) => after(task),
    signal: request.signal,
  });
}
