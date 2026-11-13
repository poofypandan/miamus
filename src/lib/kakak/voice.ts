// Talk to Kakak (voice beta, roadmap item 23's first step). The phone's own
// speech features only: the browser's SpeechRecognition turns speech into
// text, which goes to Kakak exactly as if it had been typed; speechSynthesis
// reads her replies aloud. No audio reaches Miamus, and no speech service or
// key is added. Pure, so the state machine is unit-tested with a fake
// recognition object (tests/unit/kakak-voice.test.ts).

import { describeSuggestion } from "./describe";
import type { KakakSuggestion } from "./suggestions";

export type VoiceLocale = "en" | "id";

/** The browser tag each owner language is heard and spoken in. */
export const VOICE_LANG: Record<VoiceLocale, string> = { en: "en-US", id: "id-ID" };

/**
 * What the mic panel shows. "thinking" (Kakak is answering) and "speaking"
 * (her reply is read aloud) are driven from outside the recognizer.
 */
export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

/**
 * Why listening stopped, in the owner's terms.
 * - quiet: nothing was heard;
 * - blocked: the microphone permission was refused;
 * - unavailable: this browser has the API but won't run it here — iPhone
 *   Home Screen apps (WebKit bug 225298), Siri and Dictation off, a
 *   language it can't hear. The panel then shows the keyboard tip for good;
 * - no_mic: no microphone, or another app holds it;
 * - offline: the browser's speech service needs the internet;
 * - failed: anything else.
 */
export type VoiceProblem = "quiet" | "blocked" | "unavailable" | "no_mic" | "offline" | "failed";

export interface VoiceState {
  phase: VoicePhase;
  /** What was heard so far, final words then the guess still forming. */
  transcript: string;
  problem: VoiceProblem | null;
  /** False once the browser has shown it can't listen here. */
  canListen: boolean;
}

export type VoiceEvent =
  | { type: "listen" }
  | { type: "heard"; transcript: string }
  | { type: "done" }
  | { type: "stop" }
  | { type: "problem"; problem: VoiceProblem }
  | { type: "thinking"; on: boolean }
  | { type: "speaking"; on: boolean };

export function initialVoiceState(canListen: boolean): VoiceState {
  return { phase: "idle", transcript: "", problem: null, canListen };
}

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case "listen":
      if (!state.canListen) return state;
      return { ...state, phase: "listening", transcript: "", problem: null };
    case "heard":
      return state.phase === "listening" ? { ...state, transcript: event.transcript } : state;
    case "done":
    case "stop":
      return state.phase === "listening" ? { ...state, phase: "idle" } : state;
    case "problem":
      return {
        ...state,
        phase: state.phase === "listening" ? "idle" : state.phase,
        problem: event.problem,
        canListen: state.canListen && event.problem !== "unavailable",
      };
    case "thinking":
      if (event.on) return { ...state, phase: "thinking", problem: null };
      return state.phase === "thinking" ? { ...state, phase: "idle" } : state;
    case "speaking":
      if (event.on) return state.phase === "listening" ? state : { ...state, phase: "speaking" };
      return state.phase === "speaking" ? { ...state, phase: "idle" } : state;
  }
}

/** The browser's error codes (Web Speech API), mapped to what the owner sees. */
export function problemFor(error: string): VoiceProblem | null {
  switch (error) {
    case "aborted":
      return null; // we stopped it
    case "no-speech":
      return "quiet";
    case "not-allowed":
      return "blocked";
    case "service-not-allowed":
    case "language-not-supported":
      return "unavailable";
    case "audio-capture":
      return "no_mic";
    case "network":
      return "offline";
    default:
      return "failed";
  }
}

// ---- The recognizer --------------------------------------------------------

/** The slice of SpeechRecognition this uses; a fake in the tests. */
export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface RecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

export type RecognitionCtor = new () => RecognitionLike;

/** The browser's recognizer, prefixed on Safari and Chrome, or null. */
export function findRecognition(scope: unknown = typeof window === "undefined" ? undefined : window): RecognitionCtor | null {
  if (!scope || typeof scope !== "object") return null;
  const w = scope as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ---- Joining what was heard ------------------------------------------------

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** A word as compared: case and punctuation don't make it a different word. */
function wordKey(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function sameWords(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((word, i) => wordKey(word) === wordKey(b[i]));
}

function startsWithWords(text: string[], start: string[]): boolean {
  return start.length > 0 && start.length <= text.length && start.every((word, i) => wordKey(word) === wordKey(text[i]));
}

/** Two stretches of words as one tidy line. */
export function joinWords(base: string, next: string): string {
  return [...splitWords(base), ...splitWords(next)].join(" ");
}

/**
 * One recognizer session's results as one line: final words, then the guess
 * still forming. Read from the whole list each time, so a guess the browser
 * corrects is replaced, never added to, and an event sent twice adds nothing.
 * Each result is the owner's next words, so they are joined as they are,
 * except:
 * - a result that only repeats the one before word for word (a browser
 *   sending a result twice) is dropped;
 * - with `snapshots` (Chrome on Android, whose results in continuous mode
 *   each hold everything heard so far), a result that starts with all the
 *   words so far replaces them instead of repeating them.
 * Only on Android: elsewhere "Feed Mocha at seven" then "Feed Mocha at seven
 * thirty tomorrow" are two requests, and both are kept.
 */
export function joinSession(results: RecognitionResultEventLike["results"], snapshots = false): string {
  let line: string[] = [];
  let previous: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const words = splitWords(results[i][0]?.transcript ?? "");
    if (!words.length || sameWords(words, previous)) continue;
    line = snapshots && startsWithWords(words, line) ? words : [...line, ...words];
    previous = words;
  }
  return line.join(" ");
}

// ---- Listening until Done ---------------------------------------------------

export interface ListenHandlers {
  /** Every change in what was heard, for the live words. */
  onHeard: (transcript: string) => void;
  /** Listening finished (Done or the time limit in the new flow, Stop or the browser's end in the current one): the words heard. */
  onFinished: (transcript: string) => void;
  onProblem: (problem: VoiceProblem) => void;
}

export interface Listening {
  /** Stop listening and hand over what was heard (Done, or Stop in the current flow). */
  finish: () => void;
  /** Stop and drop what was heard. */
  cancel: () => void;
}

/** How long Done (or Stop) waits for the browser's own end before ending itself. */
export const FINISH_GRACE_MS = 1500;

/** The safety limit: listening ends by itself after this long, as if Done was tapped. */
export const MAX_LISTEN_MS = 60_000;

/**
 * A session that ends this soon with nothing heard, or a restart that fails
 * before hearing anything, is a stumble; this many in a row means the
 * browser won't keep listening, so it stops (keeping the words) instead of
 * starting again forever.
 */
export const QUICK_END_MS = 500;
export const MAX_STUMBLES = 3;

export interface ListenOptions {
  /** The browser sends each result as everything so far (Chrome on Android): see `joinSession`. */
  snapshots?: boolean;
  /** The clock, for the tests. */
  now?: () => number;
}

/** Chrome on Android, whose continuous results are snapshots of everything so far. */
export function sendsSnapshots(userAgent: string): boolean {
  return /android/i.test(userAgent);
}

/**
 * Tap to start, tap Done to stop. Listens until `finish()` (or
 * MAX_LISTEN_MS), however long the owner pauses to think. Chrome on Android
 * ends a session at a pause even in continuous mode, and Safari on iPhone
 * has its own limits, so when the browser ends by itself a new recognizer
 * starts quietly and its words are added after the ones before. Nothing is
 * said twice: a session's words are frozen when it ends, an ended session's
 * late results are ignored, and each session is read from its own full list
 * (`joinSession`). A new recognizer each time, because Safari on iPhone
 * doesn't reliably start a used one again.
 */
export function listenUntilDone(
  Ctor: RecognitionCtor,
  lang: string,
  handlers: ListenHandlers,
  { snapshots = false, now = Date.now }: ListenOptions = {}
): Listening {
  /** Words from the sessions that ended. */
  let kept = "";
  /** `kept` plus the session listening now: what the owner sees. */
  let heard = "";
  let state: "on" | "finishing" | "over" = "on";
  let current: RecognitionLike | null = null;
  let stumbles = 0;
  let sessions = 0;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  const end = () => {
    state = "over";
    current = null;
    clearTimeout(graceTimer);
    clearTimeout(limitTimer);
  };
  /** Hand over the words, or say nothing was heard. */
  const handOver = () => {
    if (state === "over") return;
    end();
    if (heard) handlers.onFinished(heard);
    else handlers.onProblem("quiet");
  };
  /** A real problem: keep what was heard if anything was, so no words are lost. */
  const fail = (problem: VoiceProblem) => {
    if (state === "over") return;
    const r = current;
    end();
    try {
      r?.abort();
    } catch {
      // already stopped
    }
    if (heard) handlers.onFinished(heard);
    else handlers.onProblem(problem);
  };

  const begin = () => {
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    const startedAt = now();
    let gotWords = false;
    /** A restart that failed before hearing anything: try again, within the stumble limit. */
    let stumbled = false;
    current = recognition;
    sessions++;

    recognition.onresult = (event) => {
      if (current !== recognition) return; // an old session, or listening is over
      const session = joinSession(event.results, snapshots);
      if (session) gotWords = true;
      const next = joinWords(kept, session);
      if (next !== heard) {
        heard = next;
        handlers.onHeard(heard);
      }
    };
    recognition.onerror = (event) => {
      if (current !== recognition) return;
      const problem = problemFor(event.error);
      // Silence isn't a problem while listening: the session ends and the
      // next one starts. Aborted is one of ours.
      if (!problem || problem === "quiet") return;
      // A restarted recognizer can fail while Android still holds the mic
      // from the last one: start again (counted as a stumble) rather than
      // end what the owner is saying. A refused microphone always ends it.
      if (sessions > 1 && !gotWords && problem !== "blocked") {
        stumbled = true;
        return;
      }
      fail(problem);
    };
    recognition.onend = () => {
      if (current !== recognition) return;
      kept = heard; // the session's words, its last guess included
      if (state === "finishing") return handOver();
      const quick = !gotWords && (stumbled || now() - startedAt < QUICK_END_MS);
      stumbles = quick ? stumbles + 1 : 0;
      if (stumbles >= MAX_STUMBLES) return handOver();
      begin();
    };

    try {
      recognition.start();
    } catch {
      // Safari throws when the service is off (Siri and Dictation disabled).
      current = null;
      if (sessions === 1) fail("unavailable");
      else handOver();
    }
  };

  const finish = () => {
    if (state !== "on") return;
    state = "finishing";
    const r = current;
    try {
      r?.stop();
    } catch {
      // already stopping
    }
    // Safari on iPhone sometimes never fires end after stop().
    graceTimer = setTimeout(handOver, FINISH_GRACE_MS);
  };

  const limitTimer = setTimeout(finish, MAX_LISTEN_MS);
  begin();

  return {
    finish,
    cancel() {
      if (state === "over") return;
      const r = current;
      end();
      try {
        r?.abort();
      } catch {
        // already stopped
      }
    },
  };
}

// ---- The current flow (switch off) ------------------------------------------

/** All results so far, as one line: final words, then the guess forming. */
export function joinResults(results: RecognitionResultEventLike["results"]): string {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) parts.push(results[i][0]?.transcript ?? "");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * One utterance: start, report what is heard as it forms, and on the
 * browser's end hand over the words. A new recognizer each time, because
 * Safari on iPhone doesn't reliably start a used one again.
 */
export function listenOnce(Ctor: RecognitionCtor, lang: string, handlers: ListenHandlers): Listening {
  let heard = "";
  let cancelled = false;
  let failed = false;
  let ended = false;
  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    if (cancelled || ended) return; // late words after Stop's grace: already sent
    heard = joinResults(event.results);
    handlers.onHeard(heard);
  };
  recognition.onerror = (event) => {
    if (cancelled || ended) return;
    const problem = problemFor(event.error);
    if (!problem) return;
    // Silence after some words isn't a problem: send the words.
    if (problem === "quiet" && heard) return;
    failed = true;
    handlers.onProblem(problem);
  };
  const end = () => {
    if (ended) return;
    ended = true;
    if (cancelled || failed) return;
    if (heard) handlers.onFinished(heard);
    else handlers.onProblem("quiet");
  };
  recognition.onend = end;

  try {
    recognition.start();
  } catch {
    // Safari throws when the service is off (Siri and Dictation disabled).
    failed = true;
    ended = true;
    handlers.onProblem("unavailable");
  }

  return {
    finish() {
      if (cancelled || ended) return;
      try {
        recognition.stop();
      } catch {
        // already stopping
      }
      // Safari on iPhone sometimes never fires end after stop().
      setTimeout(end, FINISH_GRACE_MS);
    },
    cancel() {
      if (cancelled || ended) return;
      cancelled = true;
      try {
        recognition.abort();
      } catch {
        // already stopped
      }
    },
  };
}

// ---- The switch --------------------------------------------------------------

/**
 * The new voice flow (tap Done, check, then Send) is opt-in per phone while
 * the owner tries it: opening any Miamus address with ?newvoice=1 turns it
 * on for this phone, ?newvoice=0 turns it off. Off by default, and then the
 * current flow above runs unchanged.
 */
export const NEW_VOICE_KEY = "miamus.kakak.newVoice";
export const NEW_VOICE_PARAM = "newvoice";

/** What the address asks for: on, off, or nothing. */
export function newVoiceFromUrl(search: string): boolean | null {
  let value: string | null = null;
  try {
    value = new URLSearchParams(search).get(NEW_VOICE_PARAM);
  } catch {
    return null;
  }
  return value === "1" ? true : value === "0" ? false : null;
}

export function readNewVoice(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try {
    return storage?.getItem(NEW_VOICE_KEY) === "on";
  } catch {
    return false;
  }
}

/**
 * Applies ?newvoice= from the address, if there is one, and says whether the
 * new flow is on for this phone.
 */
export function syncNewVoice(search: string, storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined): boolean {
  const asked = newVoiceFromUrl(search);
  if (asked === null) return readNewVoice(storage);
  try {
    if (asked) storage?.setItem(NEW_VOICE_KEY, "on");
    else storage?.removeItem(NEW_VOICE_KEY);
  } catch {
    // storage blocked: the choice lasts this visit only
  }
  return asked;
}

// ---- Reading aloud ---------------------------------------------------------

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

// Names of the more natural voices phones ship: Google's on Android and
// Chrome, Apple's enhanced and premium voices, and the Indonesian ones.
const NATURAL = /(natural|premium|enhanced|neural|siri|google|damayanti)/i;

// Kakak is an older sister, so she reads aloud in a woman's voice when the
// phone has one (owner, 2026-11-11). Browsers don't say a voice's gender, so
// these are names: Apple's from macOS's own voice list, Google's (desktop
// Chrome, and Android's "Natural" voices and their id-id-x-… engine ids),
// and Microsoft's (Windows, Edge), from Readium Speech's curated lists
// (github.com/readium/speech, json/en.json and id.json), read 2026-11-11.
// Children's voices (Microsoft Ana, Maisie) are left out on purpose.
const FEMALE: Record<VoiceLocale, RegExp> = {
  id: new RegExp(
    [
      String.raw`\b(damayanti|gadis)\b`,
      String.raw`^google bahasa indonesia( [12] \(natural\))?$`,
      String.raw`^chrome os bahasa indonesia [12]$`,
      String.raw`\bid-id-x-(idc|idd)-`,
      String.raw`\bid-id-language$`,
    ].join("|"),
    "i"
  ),
  en: new RegExp(
    [
      String.raw`\bfemale\b`,
      String.raw`\b(samantha|zoe|allison|nicky|joelle|karen|matilda|catherine|moira|tessa|fiona|kate|serena|stephanie|martha|tara|isha|sangeeta|veena)\b`,
      String.raw`\b(zira|hazel|susan|linda|heera|jenny|aria|michelle|sonia|libby|natasha|clara|neerja|emily|leah|molly|rosa|luna)\b`,
      String.raw`\b(ava|emma)(multilingual)?\b`,
      String.raw`^google us english( [1257] \(natural\))?$`,
      String.raw`^google uk english [246] \(natural\)$`,
      String.raw`^google australian english [13] \(natural\)$`,
      String.raw`^chrome os (us english [1257]|uk english [246]|australian english [13])$`,
      String.raw`\ben-us-x-(tpc|iob|iog|tpf|sfg)-`,
      String.raw`\ben-gb-x-(gba|gbc|gbg)-`,
      String.raw`\ben-au-x-(aua|auc)-`,
      String.raw`\ben-(us|gb|au)-language$`,
    ].join("|"),
    "i"
  ),
};

// Known men's voices, so that a voice we can't place beats one we know is a
// man's. Microsoft Andika (Indonesian) is left unplaced: the sources disagree.
const MALE: Record<VoiceLocale, RegExp> = {
  id: new RegExp(
    [
      String.raw`\bardi\b`,
      String.raw`^google bahasa indonesia [34] \(natural\)$`,
      String.raw`^chrome os bahasa indonesia [34]$`,
      String.raw`\bid-id-x-(ide|dfz)-`,
    ].join("|"),
    "i"
  ),
  en: new RegExp(
    [
      String.raw`\bmale\b`,
      String.raw`\b(daniel|alex|tom|aaron|arthur|oliver|jamie|rishi|aman|lee|gordon|evan|nathan)\b`,
      String.raw`\b(david|mark|george|richard|ravi|sean|guy|ryan|thomas|eric|roger|steffan|liam|connor|prabhat|luke)\b`,
      String.raw`\b(andrew|brian|christopher|william)(multilingual)?\b`,
      String.raw`^google us english [346] \(natural\)$`,
      String.raw`^google uk english [135] \(natural\)$`,
      String.raw`^google australian english [24] \(natural\)$`,
      String.raw`\ben-us-x-(iol|iom|tpd)-`,
      String.raw`\ben-gb-x-(rjs|gbb|gbd)-`,
      String.raw`\ben-au-x-(aub|aud)-`,
    ].join("|"),
    "i"
  ),
};

// Apple's novelty voices (singing, whispering, robots): never Kakak.
const NOVELTY =
  /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox)(\s*\(|$)/i;

// Real voices that sound robotic (Apple's Eloquence and old MacinTalk
// voices, eSpeak): only when the language has nothing better.
const ROBOTIC =
  /^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|fred|junior|kathy|ralph)(\s*\(|$)|^espeak\b/i;

/**
 * How one voice ranks for the owner's language; -1 means never. Each rule
 * outweighs every rule below it together:
 * 1. the owner's language (a voice in another language is never picked);
 * 2. not robotic;
 * 3. a known woman's voice, then one we can't place, then a known man's;
 * 4. the exact accent (en-US for English, id-ID for Indonesian);
 * 5. a natural-sounding voice;
 * 6. the phone's default.
 */
export function voiceScore(voice: VoiceLike, locale: VoiceLocale): number {
  const lang = voice.lang.replace("_", "-").toLowerCase();
  if (lang !== locale && !lang.startsWith(`${locale}-`)) return -1;
  const name = voice.name.trim();
  if (NOVELTY.test(name)) return -1;
  let points = 0;
  if (!ROBOTIC.test(name)) points += 32;
  if (FEMALE[locale].test(name)) points += 16;
  else if (!MALE[locale].test(name)) points += 8;
  if (lang === VOICE_LANG[locale].toLowerCase()) points += 4;
  if (NATURAL.test(name)) points += 2;
  if (voice.default) points += 1;
  return points;
}

/**
 * Kakak's reading voice: a woman's voice in the owner's language when the
 * phone has one, the most natural first; otherwise the best other voice in
 * that language; or null to let the browser pick (it still speaks, in its
 * default voice for `lang`).
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], locale: VoiceLocale): V | null {
  const score = (voice: V) => voiceScore(voice, locale);
  let best: V | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    const s = score(voice);
    if (s > bestScore) {
      best = voice;
      bestScore = s;
    }
  }
  return bestScore >= 0 ? best : null;
}

/** The speaker switch, remembered on this phone only. */
export const SPEAK_KEY = "miamus.kakak.readAloud";

export function readSpeakChoice(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try {
    return storage?.getItem(SPEAK_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeSpeakChoice(storage: Pick<Storage, "setItem"> | undefined, on: boolean): void {
  try {
    storage?.setItem(SPEAK_KEY, on ? "on" : "off");
  } catch {
    // private mode: the choice lasts this visit only
  }
}

/** Text for reading aloud: dashes become pauses, stray symbols go. */
export function speakable(text: string): string {
  return text
    .replace(/\s*[—–·]\s*/g, ", ")
    .replace(/[•*_#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- What Kakak says -------------------------------------------------------

/**
 * The parts of the Tell Kakak sheet's screen this reads. Structural, so the
 * sheet passes its own screen as it is.
 */
export interface VoiceScreen {
  kind: string;
  question?: string;
  text?: string;
  items?: KakakSuggestion[];
  requestId?: string;
}

/**
 * What Kakak says on this screen, for reading aloud: her question, her
 * message, or the card read as it is shown (each item's heading, then every
 * row's label and value, then its note), then "Is that right?". Labels stay
 * in because some carry the fact: a pet routine's times are its labels.
 */
export function kakakWords(screen: VoiceScreen, locale: VoiceLocale): string {
  const t = (en: string, id: string) => (locale === "id" ? id : en);
  switch (screen.kind) {
    case "question":
      return screen.question ?? "";
    case "message":
    // Kakak's "Done" after a pet routine is saved (Phase 173 PR B).
    case "saved":
      return screen.text ?? "";
    case "card": {
      const items = (screen.items ?? []).map((item) => {
        const card = describeSuggestion(item, locale);
        const rows = card.rows.map((row) => `${row.label} ${row.value}`).join(", ");
        return `${card.heading}: ${rows}${card.note ? `. ${card.note}` : ""}`;
      });
      const intro = screen.text || t("Here's what I'll add:", "Ini yang akan Kakak tambahkan:");
      // One pause between parts: "add:" runs on, and no part ends in "..".
      const parts = [intro, ...items].map((part) => part.trim().replace(/\.$/, ""));
      return [...parts, t("Is that right?", "Sudah benar?")].join(". ").replace(/:\./g, ":");
    }
    default:
      return "";
  }
}
