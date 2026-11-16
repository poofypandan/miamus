import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VOICE_OUTCOMES, type VoiceOutcome } from "@/lib/kakak/app-voice";

/**
 * Which way a reply was read aloud (src/lib/kakak/app-voice.ts reportOutcome):
 * Kakak's own voice ("played"), or why the phone's voice took over (timeout,
 * autoplay, budget…). One word from a fixed list, logged for signed-in
 * callers only. No text, no ids, nothing stored: the server log line is the
 * whole record, so a phone that keeps falling back can be diagnosed.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let outcome: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 200) return new Response(null, { status: 413 });
    outcome = (JSON.parse(raw) as { outcome?: unknown } | null)?.outcome;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof outcome !== "string" || !VOICE_OUTCOMES.includes(outcome as VoiceOutcome)) {
    return new Response(null, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return new Response(null, { status: 401 });
  console.info("kakak voice outcome", outcome);
  return new Response(null, { status: 204 });
}
