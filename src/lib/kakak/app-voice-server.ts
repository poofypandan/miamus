// Kakak's own voice on the server (POST /api/kakak/speak). One reply, already
// shaped for the ear on the phone (src/lib/kakak/app-voice.ts spokenText),
// becomes speech with ElevenLabs and streams back. The phone never sees the
// key. Kept apart from the route, with its pieces passed in, so who may call
// it, the budget and every failure are unit-tested
// (tests/unit/kakak-app-voice.test.ts) without a network or a database.
//
// Nothing is stored: no audio, no text. The only row this touches is the
// household's day in kakak_usage, which holds numbers (voice_chars,
// migrations/172). ElevenLabs keeps each generation in the account's history
// by default (zero retention is Enterprise-only), so the route asks it to
// delete that item as soon as the audio has been sent.

import { MAX_SPEAK_CHARS, type AppVoiceLocale } from "./app-voice";

/** Kakak's chosen voice for the launch trailer (15 Nov): "Lyly" on eleven_v4. */
export const DEFAULT_VOICE_MODEL = "eleven_v4";

/**
 * Characters a household may have spoken in Kakak's voice per Jakarta day,
 * when KAKAK_VOICE_DAILY_CHARS isn't set. About 20 spoken replies; at most
 * 90,000 a month, inside the Creator plan's 121,000 credits with room left
 * for the trailer.
 */
export const DEFAULT_DAILY_CHARS = 3_000;
/** The most KAKAK_VOICE_DAILY_CHARS may say, whatever is typed into it. */
export const MAX_DAILY_CHARS = 1_000_000;

/** A small, clear MP3: plenty for a voice, quick to send over a phone signal. */
export const OUTPUT_FORMAT = "mp3_44100_64";
/** Fixed: the key and Kakak's words only ever go to ElevenLabs. */
export const ELEVENLABS_API = "https://api.elevenlabs.io";
/** How long the server waits for ElevenLabs to start answering. */
export const UPSTREAM_TIMEOUT_MS = 10_000;

const MAX_BODY_BYTES = 4_096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Voice and model ids are short codes; anything else in the env is a typo.
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface AppVoiceConfig {
  apiKey: string;
  voiceId: string;
  model: string;
  dailyChars: number;
}

/**
 * Kakak's voice settings from the server's env, or null when it is off: no
 * ELEVENLABS_API_KEY or no KAKAK_VOICE_ID means the phone's own voice, as
 * before this feature.
 */
export function appVoiceConfig(env: Record<string, string | undefined>): AppVoiceConfig | null {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  const voiceId = env.KAKAK_VOICE_ID?.trim();
  if (!apiKey || !voiceId || !ID.test(voiceId)) return null;
  const modelEnv = env.KAKAK_VOICE_MODEL?.trim();
  const model = modelEnv && ID.test(modelEnv) ? modelEnv : DEFAULT_VOICE_MODEL;
  return { apiKey, voiceId, model, dailyChars: dailyCharsFrom(env.KAKAK_VOICE_DAILY_CHARS) };
}

/** KAKAK_VOICE_DAILY_CHARS as a whole number in range; the default otherwise. "0" turns the voice off. */
export function dailyCharsFrom(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_DAILY_CHARS;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return DEFAULT_DAILY_CHARS;
  return Math.min(n, MAX_DAILY_CHARS);
}

/** What kakak_voice_spend (migrations/172) answered. */
export type SpendResult =
  | { ok: true }
  | { ok: false; reason: "not_admin" | "not_allowed" | "off" | "budget" | "unavailable" };

export interface SpeakDeps {
  env: Record<string, string | undefined>;
  /** The signed-in user's id, or null. */
  userId: () => Promise<string | null>;
  /**
   * Counts `chars` against the household's day, only if they fit in
   * `dailyChars`, and checks the caller is an admin of a household where
   * Kakak is allowed and on: the same people /api/kakak lets in.
   */
  spend: (householdId: string, chars: number, dailyChars: number) => Promise<SpendResult>;
  fetch: typeof fetch;
  /** Runs after the response has been sent (next/server's after()). */
  later: (task: () => Promise<void>) => void;
  /** The phone went away: stop asking ElevenLabs. */
  signal?: AbortSignal;
}

/** Every answer but the audio is a small JSON body the phone reads as "use the phone's voice". */
function json(body: { kind: string }, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** GET: whether Kakak's own voice is set up, so a phone without it never waits for a refusal. */
export async function handleVoiceCheck(deps: Pick<SpeakDeps, "env" | "userId">): Promise<Response> {
  const config = appVoiceConfig(deps.env);
  if (!config || config.dailyChars === 0) return json({ kind: "off" }, 200);
  if (!(await deps.userId())) return json({ kind: "off" }, 200);
  return json({ kind: "on" }, 200);
}

/**
 * POST { householdId, text, locale }: Kakak's reply as audio/mpeg, streamed
 * from ElevenLabs; or JSON { kind } when the phone should read it itself:
 * off (not set up), budget (the day's characters are used), refused (not an
 * admin of a household with Kakak on), failed (ElevenLabs or the network).
 */
export async function handleSpeak(request: Request, deps: SpeakDeps): Promise<Response> {
  const config = appVoiceConfig(deps.env);
  if (!config || config.dailyChars === 0) return json({ kind: "off" }, 503);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json({ kind: "invalid" }, 413);

  let body: { householdId?: unknown; text?: unknown; locale?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ kind: "invalid" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ kind: "invalid" }, 400);
  }
  const householdId = typeof body?.householdId === "string" && UUID.test(body.householdId) ? body.householdId : null;
  const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  const locale: AppVoiceLocale | null = body?.locale === "id" ? "id" : body?.locale === "en" ? "en" : null;
  if (!householdId || !locale || !text || text.length > MAX_SPEAK_CHARS) return json({ kind: "invalid" }, 400);

  if (!(await deps.userId())) return json({ kind: "refused" }, 401);

  const spent = await deps.spend(householdId, text.length, config.dailyChars);
  if (!spent.ok) {
    if (spent.reason === "budget") return json({ kind: "budget" }, 429);
    if (spent.reason === "unavailable") return json({ kind: "off" }, 503);
    return json({ kind: "refused" }, 403);
  }

  const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;
  let upstream: Response;
  try {
    upstream = await deps.fetch(
      `${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(config.voiceId)}/stream?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": config.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: config.model, language_code: locale }),
        signal,
      }
    );
  } catch (error) {
    console.error("kakak voice: no answer", (error as { name?: string }).name ?? "error");
    return json({ kind: "failed" }, 502);
  }
  if (!upstream.ok || !upstream.body) {
    // The status only: ElevenLabs' error body can echo the text.
    console.error("kakak voice: refused by ElevenLabs", upstream.status);
    void upstream.body?.cancel().catch(() => {});
    return json({ kind: "failed" }, 502);
  }

  const historyId = upstream.headers.get("history-item-id") ?? upstream.headers.get("history_item_id");
  if (historyId && ID.test(historyId)) {
    deps.later(() => forget(deps.fetch, config.apiKey, historyId));
  } else {
    console.error("kakak voice: no history item to delete");
  }
  console.info("kakak voice", locale, text.length);
  return new Response(upstream.body, {
    status: 200,
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
  });
}

/** Waits before asking ElevenLabs to delete: a new item takes a moment to reach its history. */
export const FORGET_DELAYS_MS = [3_000, 10_000];

/**
 * Deletes the generation from the ElevenLabs account's history, so neither
 * Kakak's words nor her audio is kept there. Tries again once if the item
 * isn't there yet.
 */
export async function forget(
  fetchFn: typeof fetch,
  apiKey: string,
  historyId: string,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<void> {
  for (const delay of FORGET_DELAYS_MS) {
    await wait(delay);
    try {
      const response = await fetchFn(`${ELEVENLABS_API}/v1/history/${encodeURIComponent(historyId)}`, {
        method: "DELETE",
        headers: { "xi-api-key": apiKey },
        signal: AbortSignal.timeout(5_000),
      });
      void response.body?.cancel().catch(() => {});
      if (response.ok) return;
      if (response.status !== 404 && response.status !== 400 && response.status < 500) {
        console.error("kakak voice: history not deleted", response.status);
        return;
      }
    } catch {
      // try again below
    }
  }
  console.error("kakak voice: history not deleted after retries");
}
