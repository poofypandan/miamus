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

/** What kakak_voice_check (migrations/173) and kakak_voice_spend (migrations/172) answered. */
export type SpendResult =
  | { ok: true }
  | { ok: false; reason: "not_admin" | "not_allowed" | "off" | "budget" | "unavailable" };

export interface SpeakDeps {
  env: Record<string, string | undefined>;
  /** The signed-in user's id, or null. */
  userId: () => Promise<string | null>;
  /**
   * Whether `chars` would still fit in the household's day, and the caller is
   * an admin of a household where Kakak is allowed and on (the same people
   * /api/kakak lets in). Counts nothing (kakak_voice_check, migrations/173).
   */
  check: (householdId: string, chars: number, dailyChars: number) => Promise<SpendResult>;
  /**
   * Counts `chars` against the household's day, only if they fit in
   * `dailyChars` (kakak_voice_spend, migrations/172). Called once ElevenLabs
   * has started sending audio, so a reply that never reached the phone
   * costs the household nothing.
   */
  spend: (householdId: string, chars: number, dailyChars: number) => Promise<SpendResult>;
  fetch: typeof fetch;
  /** Runs after the response has been sent (next/server's after()). */
  later: (task: () => Promise<void>) => void;
  /** The phone went away: stop asking ElevenLabs. */
  signal?: AbortSignal;
  /** Milliseconds, for Server-Timing; performance.now() by default. */
  now?: () => number;
}

/** Durations in ms for the Server-Timing header: where the wait before her first word went. */
type Timings = Partial<Record<"auth" | "rpc" | "upstream_ttfb" | "spend", number>>;

const TIMING_ORDER = ["auth", "rpc", "upstream_ttfb", "spend"] as const;

function serverTiming(timings: Timings): string {
  return TIMING_ORDER.filter((name) => timings[name] !== undefined)
    .map((name) => `${name};dur=${Math.round(timings[name] as number)}`)
    .join(", ");
}

/** Every answer but the audio is a small JSON body the phone reads as "use the phone's voice". */
function json(body: { kind: string }, status: number, timings: Timings = {}): Response {
  const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
  const timing = serverTiming(timings);
  if (timing) headers["server-timing"] = timing;
  return new Response(JSON.stringify(body), { status, headers });
}

/** GET: whether Kakak's own voice is set up, so a phone without it never waits for a refusal. */
export async function handleVoiceCheck(deps: Pick<SpeakDeps, "env" | "userId">): Promise<Response> {
  const config = appVoiceConfig(deps.env);
  if (!config || config.dailyChars === 0) return json({ kind: "off" }, 200);
  if (!(await deps.userId())) return json({ kind: "off" }, 200);
  return json({ kind: "on" }, 200);
}

/**
 * ElevenLabs serves its newest models (eleven_v3, eleven_v4) through Text to
 * Dialogue (https://elevenlabs.io/docs/models), and the older ones through
 * Text to Speech. A model on the endpoint that doesn't serve it is refused
 * (#148 on eleven_v4: every reply fell back to the phone's voice), so the
 * route asks the one that should serve the model, and the other once if that
 * one says the request is wrong.
 */
export type VoiceEndpoint = "dialogue" | "tts";

export function endpointsFor(model: string): [VoiceEndpoint, VoiceEndpoint] {
  return /^eleven_v[3-9]/.test(model) ? ["dialogue", "tts"] : ["tts", "dialogue"];
}

/** A refusal that says "wrong endpoint or body for this model", not "no key" or "too busy". */
const TRY_OTHER_ENDPOINT = new Set([400, 404, 405, 422]);

export function upstreamRequest(
  endpoint: VoiceEndpoint,
  config: AppVoiceConfig,
  text: string,
  locale: AppVoiceLocale
): { url: string; body: string } {
  if (endpoint === "dialogue") {
    return {
      url: `${ELEVENLABS_API}/v1/text-to-dialogue/stream?output_format=${OUTPUT_FORMAT}`,
      body: JSON.stringify({ inputs: [{ text, voice_id: config.voiceId }], model_id: config.model, language_code: locale }),
    };
  }
  return {
    url: `${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(config.voiceId)}/stream?output_format=${OUTPUT_FORMAT}`,
    body: JSON.stringify({ text, model_id: config.model, language_code: locale }),
  };
}

/**
 * POST { householdId, text, locale }: Kakak's reply as audio/mpeg, streamed
 * from ElevenLabs; or JSON { kind } when the phone should read it itself:
 * off (not set up), budget (the day's characters are used), refused (not an
 * admin of a household with Kakak on), failed (ElevenLabs or the network).
 *
 * Quick to the first word: who may ask and the budget are checked together
 * with the sign-in, ElevenLabs is asked straight after, and the characters
 * are counted once its first audio arrives, so a reply the phone gave up on
 * (or ElevenLabs refused) is never charged to the household's day.
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

  const now = deps.now ?? (() => performance.now());
  const timings: Timings = {};
  const timed = async <T>(name: keyof Timings, task: () => Promise<T>): Promise<T> => {
    const start = now();
    try {
      return await task();
    } finally {
      timings[name] = now() - start;
    }
  };

  // Both before anything is sent to ElevenLabs: nobody else's words, and
  // nothing past the budget, ever costs a generation.
  const [userId, allowed] = await Promise.all([
    timed("auth", deps.userId),
    timed("rpc", () => deps.check(householdId, text.length, config.dailyChars)),
  ]);
  if (!userId) return json({ kind: "refused" }, 401, timings);
  const refusal = refusalFor(allowed, timings);
  if (refusal) return refusal;

  const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;
  const startedAt = Math.floor(Date.now() / 1000);
  const upstreamStart = now();
  let upstream: Response | null = null;
  let endpoint: VoiceEndpoint | null = null;
  try {
    for (const candidate of endpointsFor(config.model)) {
      const { url, body: upstreamBody } = upstreamRequest(candidate, config, text, locale);
      const answer = await deps.fetch(url, {
        method: "POST",
        headers: { "xi-api-key": config.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: upstreamBody,
        signal,
      });
      if (answer.ok && answer.body) {
        upstream = answer;
        endpoint = candidate;
        break;
      }
      // The status and endpoint only: ElevenLabs' error body can echo the text.
      console.error("kakak voice: refused by ElevenLabs", candidate, answer.status);
      void answer.body?.cancel().catch(() => {});
      if (!TRY_OTHER_ENDPOINT.has(answer.status)) break;
    }
  } catch (error) {
    console.error("kakak voice: no answer", (error as { name?: string }).name ?? "error");
    return json({ kind: "failed" }, 502, timings);
  }
  if (!upstream?.body || !endpoint) return json({ kind: "failed" }, 502, timings);

  // Wait for the first audio, so the phone's clock (AUDIO_WAIT_MS) is spent
  // on audio, and nothing is counted for a generation that never started.
  const reader = upstream.body.getReader();
  let first: Uint8Array | undefined;
  try {
    const chunk = await reader.read();
    first = chunk.done ? undefined : chunk.value;
  } catch (error) {
    console.error("kakak voice: no audio", (error as { name?: string }).name ?? "error");
  }
  timings.upstream_ttfb = now() - upstreamStart;
  if (!first?.byteLength || deps.signal?.aborted) {
    void reader.cancel().catch(() => {});
    if (deps.signal?.aborted) console.info("kakak voice: phone gave up before the audio, not counted");
    return json({ kind: "failed" }, 502, timings);
  }

  const spent = await timed("spend", () => deps.spend(householdId, text.length, config.dailyChars));
  const late = refusalFor(spent, timings);
  if (late) {
    // Another phone used the last of the day in the meantime.
    void reader.cancel().catch(() => {});
    return late;
  }

  const historyId = upstream.headers.get("history-item-id") ?? upstream.headers.get("history_item_id");
  const requestId = upstream.headers.get("request-id");
  if (historyId && ID.test(historyId)) {
    deps.later(() => forget(deps.fetch, config.apiKey, historyId));
  } else if (requestId && ID.test(requestId)) {
    deps.later(() => forgetByRequest(deps.fetch, config.apiKey, requestId, startedAt));
  } else {
    console.error("kakak voice: no history item to delete");
  }
  const timing = serverTiming(timings);
  console.info("kakak voice", locale, text.length, endpoint, timing);

  const head = first;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(head);
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      return reader.cancel().catch(() => {});
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "server-timing": timing },
  });
}

/** The phone-voice answer for a refused check or count, or null when it went through. */
function refusalFor(result: SpendResult, timings: Timings): Response | null {
  if (result.ok) return null;
  if (result.reason === "budget") return json({ kind: "budget" }, 429, timings);
  if (result.reason === "unavailable") return json({ kind: "off" }, 503, timings);
  return json({ kind: "refused" }, 403, timings);
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

/**
 * The same, when ElevenLabs answered with a request id but no history item
 * id (Text to Dialogue may not send one): finds this generation in the
 * account's history by its request id, from the moment it was asked for,
 * and deletes that item only. Never deletes by voice or time alone, so the
 * trailer's own generations in the same account are left alone.
 */
export async function forgetByRequest(
  fetchFn: typeof fetch,
  apiKey: string,
  requestId: string,
  sinceUnix: number,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<void> {
  for (const delay of FORGET_DELAYS_MS) {
    await wait(delay);
    try {
      const response = await fetchFn(
        `${ELEVENLABS_API}/v1/history?page_size=20&date_after_unix=${Math.max(0, sinceUnix - 60)}`,
        { headers: { "xi-api-key": apiKey }, signal: AbortSignal.timeout(5_000) }
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status < 500) {
          console.error("kakak voice: history not listed", response.status);
          return;
        }
        continue;
      }
      const page = (await response.json()) as { history?: { history_item_id?: unknown; request_id?: unknown }[] };
      const item = page.history?.find((entry) => entry.request_id === requestId);
      const historyId = typeof item?.history_item_id === "string" ? item.history_item_id : null;
      if (historyId && ID.test(historyId)) return forget(fetchFn, apiKey, historyId, async () => {});
    } catch {
      // try again below
    }
  }
  console.error("kakak voice: history item not found to delete");
}
