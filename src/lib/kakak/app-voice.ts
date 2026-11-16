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

/**
 * How long the phone waits for Kakak's first audio before using its own
 * voice. The server answers only once ElevenLabs has started sending audio,
 * so this covers a cold start, the sign-in and budget check, and the
 * model's time to first byte (2.5 s in #148 was often too short).
 */
export const AUDIO_WAIT_MS = 6_000;
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

/**
 * Why the phone's voice read a reply instead of Kakak's, or "played" when
 * hers did. Words for a log line and a numbers-only report: never the text.
 */
export type VoiceOutcome =
  | "played"
  | "offline"
  | "timeout"
  | "network"
  | "refused"
  | "budget"
  | "off"
  | "upstream"
  | "autoplay"
  | "unplayable";

export const VOICE_OUTCOMES: readonly VoiceOutcome[] = [
  "played",
  "offline",
  "timeout",
  "network",
  "refused",
  "budget",
  "off",
  "upstream",
  "autoplay",
  "unplayable",
];

/** The reason behind a status from /api/kakak/speak that isn't audio. */
export function outcomeFor(status: number): VoiceOutcome {
  if (status === 401 || status === 403) return "refused";
  if (status === 429) return "budget";
  if (status === 503) return "off";
  return "upstream";
}

export type AppVoiceResult =
  | { kind: "audio"; audio: Blob }
  | { kind: AppVoiceDecision & ("phone" | "phone_today"); reason: VoiceOutcome };

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
  if (!online()) return { kind: "phone", reason: "offline" };
  if (!text || signal.aborted) return { kind: "phone", reason: "network" };
  const controller = new AbortController();
  const stop = () => controller.abort();
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
      return decision === "play"
        ? { kind: "phone", reason: "upstream" }
        : { kind: decision, reason: outcomeFor(response.status) };
    }
    clearTimeout(timer);
    timer = setTimeout(stop, bodyMs);
    const audio = await response.blob();
    if (!audio.size) return { kind: "phone", reason: "upstream" };
    return { kind: "audio", audio };
  } catch {
    return { kind: "phone", reason: controller.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

/**
 * Whether a tap should play the silent sound that lets Kakak's audio play
 * later. Browsers refuse play() that doesn't follow a tap (iPhone Safari
 * always, per element; Android Chrome until the page has had one), and her
 * reply arrives seconds after the tap that asked. So: on any tap until it
 * has worked, unless the server has said her voice is off (a sound, even a
 * silent one, can pause music in another app), and never over her audio
 * while it plays.
 */
export function shouldPrimeAudio(state: {
  appVoice: "unknown" | "checking" | "on" | "off";
  unlocked: boolean;
  playing: boolean;
}): boolean {
  return state.appVoice !== "off" && !state.unlocked && !state.playing;
}

/**
 * Notes which way a reply was read: a console line on the phone, and the
 * outcome word alone to /api/kakak/speak/outcome, which logs it so a phone
 * that keeps falling back can be told apart (slow, blocked, refused) without
 * anyone opening its developer tools. No text, nothing stored.
 */
export function reportOutcome(
  outcome: VoiceOutcome,
  send: ((url: string, body: string) => boolean) | null = typeof navigator !== "undefined" && navigator.sendBeacon
    ? (url, body) => navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))
    : null
): void {
  if (outcome === "played") console.info("kakak voice: played");
  else console.info("kakak voice: phone voice,", outcome);
  try {
    send?.("/api/kakak/speak/outcome", JSON.stringify({ outcome }));
  } catch {
    // A report is never worth an error.
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
