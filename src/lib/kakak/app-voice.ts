// Kakak's own voice on the phone (the "Read replies aloud" switch). When the
// server has her ElevenLabs voice set up (POST /api/kakak/speak), each reply
// is read in it; on anything else — not set up, the day's budget used,
// offline, slow, a refusal, audio the phone won't play — the phone's own
// voice reads it exactly as before (src/components/kakak/kakak-voice.tsx).
// Pure, so the choices are unit-tested (tests/unit/kakak-app-voice.test.ts).

import { speechPlan } from "./speech";

export type AppVoiceLocale = "en" | "id";

/**
 * The most characters one reply sends to be spoken. speechPlan already keeps
 * a short opener and two sentences; this caps an unusually long one.
 */
export const MAX_SPEAK_CHARS = 600;

/** How long the phone waits for Kakak's audio to start before using its own voice. */
export const AUDIO_WAIT_MS = 2_500;
/** And for the rest of the audio to arrive, once ElevenLabs has started sending it. */
export const AUDIO_BODY_MS = 8_000;

/**
 * What is sent to be spoken: the same words the phone's voice would read
 * (speechPlan: times and symbols in words, never the card's rows), as one
 * line, cut at the last sentence or word that fits MAX_SPEAK_CHARS.
 */
export function spokenText(text: string, locale: AppVoiceLocale): string {
  const line = speechPlan(text, locale)
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (line.length <= MAX_SPEAK_CHARS) return line;
  const cut = line.slice(0, MAX_SPEAK_CHARS);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (sentence > MAX_SPEAK_CHARS / 2) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(" ");
  return word > 0 ? cut.slice(0, word) : cut;
}

/**
 * What the phone does after asking for Kakak's audio:
 * - play: the audio arrived;
 * - phone: read it with the phone's voice this time (slow, offline, a server
 *   or ElevenLabs hiccup);
 * - phone_today: read it with the phone's voice and stop asking for the rest
 *   of this visit (not set up, the day's budget used, not allowed).
 */
export type AppVoiceDecision = "play" | "phone" | "phone_today";

export function decide(outcome: number | "timeout" | "offline" | "error"): AppVoiceDecision {
  if (typeof outcome !== "number") return "phone";
  if (outcome === 200) return "play";
  // 401 signed out, 403 not allowed or Kakak off, 429 budget, 503 not set up.
  if (outcome === 401 || outcome === 403 || outcome === 429 || outcome === 503) return "phone_today";
  return "phone";
}

export type AppVoiceResult = { kind: "audio"; audio: Blob } | { kind: AppVoiceDecision & ("phone" | "phone_today") };

export interface FetchAudioOptions {
  householdId: string;
  text: string;
  locale: AppVoiceLocale;
  /** Aborted when the reply is no longer wanted (a new reply, Stop, the sheet closed). */
  signal: AbortSignal;
  fetch?: typeof fetch;
  online?: () => boolean;
  waitMs?: number;
  bodyMs?: number;
}

/**
 * Asks the server for Kakak's audio. Never throws: anything but audio within
 * the time allowed is an answer saying to use the phone's voice.
 */
export async function fetchKakakAudio({
  householdId,
  text,
  locale,
  signal,
  fetch: fetchFn = fetch,
  online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  waitMs = AUDIO_WAIT_MS,
  bodyMs = AUDIO_BODY_MS,
}: FetchAudioOptions): Promise<AppVoiceResult> {
  if (!text || !online()) return { kind: decide("offline") as "phone" };
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (signal.aborted) return { kind: "phone" };
  signal.addEventListener("abort", stop, { once: true });
  let timer = setTimeout(stop, waitMs);
  try {
    const response = await fetchFn("/api/kakak/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ householdId, text, locale }),
      signal: controller.signal,
    });
    const decision = decide(response.status);
    const isAudio = (response.headers.get("content-type") ?? "").startsWith("audio/");
    if (decision !== "play" || !isAudio) {
      void response.body?.cancel().catch(() => {});
      return { kind: decision === "play" ? "phone" : decision };
    }
    clearTimeout(timer);
    timer = setTimeout(stop, bodyMs);
    const audio = await response.blob();
    if (!audio.size) return { kind: "phone" };
    return { kind: "audio", audio };
  } catch {
    return { kind: decide(controller.signal.aborted ? "timeout" : "error") as "phone" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

/**
 * A tenth of a second of silence as a WAV data URL. Safari on iPhone plays
 * audio only from an element that was first played during a tap; the sheet
 * plays this on the owner's first tap, and later replies reuse the element.
 */
export function silentWav(): string {
  const samples = 800; // 0.1 s at 8 kHz, 8-bit mono
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // sample rate
  view.setUint32(28, 8000, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8-bit silence is the midpoint
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(binary)}`;
}
