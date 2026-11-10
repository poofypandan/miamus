"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { AudioLines, Keyboard, Loader2, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import {
  VOICE_LANG,
  findRecognition,
  initialVoiceState,
  kakakWords,
  listenOnce,
  pickVoice,
  readSpeakChoice,
  speakable,
  voiceReducer,
  writeSpeakChoice,
  type Listening,
  type VoiceLocale,
  type VoiceProblem,
  type VoiceScreen,
} from "@/lib/kakak/voice";
import { cn } from "@/lib/utils";

/** Off switch for the beta: NEXT_PUBLIC_KAKAK_VOICE=false hides it. */
const VOICE_ON = process.env.NEXT_PUBLIC_KAKAK_VOICE !== "false";

/** Talk to Kakak, or nothing at all (not even reading aloud) when switched off. */
export function KakakVoice(props: Parameters<typeof Voice>[0]) {
  return VOICE_ON ? <Voice {...props} /> : null;
}

/**
 * Talk to Kakak (voice beta). A large mic in the Kakak sheet: press and
 * talk, the words appear live in the typing box, and when the owner stops
 * they go to Kakak as a typed request through the same route. Her replies
 * can be read aloud; the speaker switch is remembered on this phone.
 *
 * The phone's own speech features only (src/lib/kakak/voice.ts): the
 * browser may send the audio to Apple or Google to turn it into text, but
 * Miamus never receives or stores audio, only the text, as typed Kakak does.
 */
function Voice({
  screen,
  listenHere,
  inputShown,
  onHeard,
  onSpoken,
}: {
  screen: VoiceScreen;
  /** Whether a spoken answer makes sense on this screen. */
  listenHere: boolean;
  /** The sheet's typing box is on screen and shows the live words. */
  inputShown: boolean;
  /** What was heard so far, for the sheet's typing box. */
  onHeard: (text: string) => void;
  /** The owner finished speaking: send these words to Kakak. */
  onSpoken: (text: string) => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const [state, dispatch] = useReducer(voiceReducer, true, initialVoiceState);
  const [ready, setReady] = useState(false);
  /** The request in flight was spoken: show "thinking" under the mic. */
  const [spoke, setSpoke] = useState(false);
  const listening = useRef<Listening | null>(null);
  const speaker = useReadAloud(locale, (on) => dispatch({ type: "speaking", on }));

  // The latest callbacks, so the recognizer's handlers never call stale ones.
  const handlers = useRef({ onHeard, onSpoken });
  useEffect(() => {
    handlers.current = { onHeard, onSpoken };
  }, [onHeard, onSpoken]);

  // Whether this browser can listen at all, known only in the browser.
  useEffect(() => {
    if (!findRecognition()) dispatch({ type: "problem", problem: "unavailable" });
    setReady(true);
    return () => listening.current?.cancel();
  }, []);

  const busy = screen.kind === "waiting";
  useEffect(() => {
    // Sent by typing while the mic was still on: drop the listening, or its
    // words would be sent a second time.
    if (busy && listening.current) {
      listening.current.cancel();
      listening.current = null;
      dispatch({ type: "stop" });
    }
    dispatch({ type: "thinking", on: busy });
    if (!busy) setSpoke(false);
  }, [busy]);

  // Read each new reply aloud, if the speaker is on. Keyed by its words, so
  // dropping an item from the card doesn't start it over.
  const words = kakakWords(screen, locale);
  const wordsKey = `${screen.kind}|${screen.requestId ?? ""}|${words}`;
  const say = speaker.say;
  useEffect(() => {
    if (words) say(words);
  }, [wordsKey, say]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by wordsKey on purpose

  const start = useCallback(() => {
    const Ctor = findRecognition();
    if (!Ctor) {
      dispatch({ type: "problem", problem: "unavailable" });
      return;
    }
    speaker.unlock();
    speaker.hush();
    dispatch({ type: "listen" });
    listening.current = listenOnce(Ctor, VOICE_LANG[locale], {
      onHeard: (text) => {
        dispatch({ type: "heard", transcript: text });
        handlers.current.onHeard(text);
      },
      onFinished: (text) => {
        listening.current = null;
        dispatch({ type: "done" });
        setSpoke(true);
        handlers.current.onSpoken(text);
      },
      onProblem: (problem) => {
        listening.current = null;
        dispatch({ type: "problem", problem });
      },
    });
  }, [locale, speaker]);

  const stop = useCallback(() => {
    if (state.phase === "listening") listening.current?.finish();
    else if (state.phase === "speaking") speaker.hush();
  }, [state.phase, speaker]);

  const cancel = useCallback(() => {
    listening.current?.cancel();
    listening.current = null;
    dispatch({ type: "stop" });
  }, []);

  if (!ready) return null;

  const { phase } = state;
  const showMic = state.canListen && (listenHere || phase === "listening" || (phase === "thinking" && spoke));
  const showBig = showMic || phase === "speaking";
  const showTip = !state.canListen && listenHere;
  if (!showBig && !showTip && !speaker.supported) return null;

  return (
    <>
      {/* The short tutorial, once, before the first try. */}
      {showMic && phase === "idle" && screen.kind === "typing" && <WhatsNewCard id="kakak-voice-2026-11" />}
      <section
        aria-label={t("Talk to Kakak", "Bicara dengan Kakak")}
        className={cn(
          "flex flex-col items-center gap-2",
          // A soft panel around the mic or the tip; just the speaker switch otherwise.
          (showBig || showTip) && "rounded-2xl border bg-slate-50/70",
          showBig ? "px-4 pb-3 pt-5" : showTip ? "px-3 py-2" : "py-0"
        )}
      >
        {showBig && (
          <>
            <BigButton phase={phase} onListen={start} onStop={stop} />
            <p role="status" aria-live="polite" className="min-h-5 text-center text-sm font-medium text-gray-900">
              {phaseLabel(phase, t)}
            </p>
            {phase === "listening" && !inputShown && state.transcript && (
              // No typing box on this screen (Kakak's question): the live
              // words show here, so nothing heard is hidden.
              <p className="max-w-full rounded-2xl rounded-br-md bg-slate-100 px-3 py-2 text-sm text-gray-900">
                {state.transcript}
              </p>
            )}
            {phase === "listening" && (
              <button
                type="button"
                onClick={cancel}
                className="-mt-1 text-xs font-medium text-muted-foreground underline-offset-4 active:underline"
              >
                {t("Cancel, don't send", "Batal, jangan kirim")}
              </button>
            )}
            {state.problem && phase === "idle" && state.canListen && (
              <p className="text-center text-xs text-muted-foreground">{problemText(state.problem, t)}</p>
            )}
          </>
        )}

        {showTip && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Keyboard className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {t(
                "This browser can't listen here. To talk instead of typing, tap the mic key on your keyboard.",
                "Browser ini belum bisa mendengar di sini. Untuk bicara tanpa mengetik, ketuk tombol mikrofon di keyboard."
              )}
            </span>
          </p>
        )}

        {speaker.supported && (
          <button
            type="button"
            aria-pressed={speaker.on}
            onClick={() => speaker.toggle()}
            className={cn(
              "flex min-h-9 items-center gap-1.5 self-center rounded-full border px-3 text-xs font-medium active:bg-muted",
              speaker.on ? "border-primary/30 bg-primary/10 text-gray-900" : "bg-card text-muted-foreground"
            )}
          >
            {speaker.on ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
            {t("Read replies aloud", "Bacakan jawaban Kakak")}
          </button>
        )}
      </section>
    </>
  );
}

function BigButton({ phase, onListen, onStop }: { phase: string; onListen: () => void; onStop: () => void }) {
  const t = useT();
  const active = phase === "listening" || phase === "speaking";
  return (
    <div className="relative flex size-24 items-center justify-center">
      {phase === "listening" && (
        <>
          {/* A slow, soft halo while listening; still for reduced motion. */}
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-primary/15 motion-safe:animate-[kakak-breathe_2.4s_ease-in-out_infinite]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-2 rounded-full bg-primary/20 motion-safe:animate-[kakak-breathe_2.4s_ease-in-out_0.6s_infinite]"
          />
        </>
      )}
      <button
        type="button"
        disabled={phase === "thinking"}
        onClick={active ? onStop : onListen}
        aria-label={
          active
            ? t("Stop", "Berhenti")
            : phase === "thinking"
              ? t("Kakak is thinking", "Kakak sedang berpikir")
              : t("Talk to Kakak", "Bicara dengan Kakak")
        }
        className={cn(
          "relative flex size-[4.5rem] items-center justify-center rounded-full shadow-sm transition-colors disabled:opacity-60",
          active ? "bg-gray-900 text-white" : "bg-primary text-primary-foreground"
        )}
      >
        {phase === "thinking" ? (
          <Loader2 className="size-7 motion-safe:animate-spin" aria-hidden="true" />
        ) : active ? (
          <Square className="size-6 fill-current" aria-hidden="true" />
        ) : (
          <Mic className="size-8" aria-hidden="true" />
        )}
      </button>
      <style>{`@keyframes kakak-breathe { 0%, 100% { transform: scale(0.92); opacity: 0.55 } 50% { transform: scale(1.08); opacity: 1 } }`}</style>
    </div>
  );
}

function phaseLabel(phase: string, t: (en: string, id: string) => string): React.ReactNode {
  switch (phase) {
    case "listening":
      return t("Listening… tap Stop when you're done", "Kakak mendengarkan… ketuk Berhenti kalau sudah");
    case "thinking":
      return t("Kakak is thinking…", "Kakak sedang berpikir…");
    case "speaking":
      return (
        <span className="inline-flex items-center gap-1.5">
          <AudioLines className="size-4 motion-safe:animate-pulse" aria-hidden="true" />
          {t("Kakak is speaking", "Kakak sedang bicara")}
        </span>
      );
    default:
      return t("Tap and talk", "Ketuk lalu bicara");
  }
}

function problemText(problem: VoiceProblem, t: (en: string, id: string) => string): string {
  switch (problem) {
    case "quiet":
      return t("I didn't hear anything. Tap the mic and try again.", "Kakak belum mendengar apa-apa. Ketuk mikrofon dan coba lagi.");
    case "blocked":
      return t(
        "Miamus can't use the microphone. Allow it in your browser's settings, or type instead.",
        "Miamus belum boleh memakai mikrofon. Izinkan di pengaturan browser, atau ketik saja."
      );
    case "no_mic":
      return t("The microphone isn't available right now. You can type instead.", "Mikrofon sedang tidak bisa dipakai. Anda bisa mengetik saja.");
    case "offline":
      return t("Listening needs the internet. You can type instead.", "Untuk mendengar perlu internet. Anda bisa mengetik saja.");
    default:
      return t("That didn't work. Tap the mic and try again, or type.", "Belum berhasil. Ketuk mikrofon dan coba lagi, atau ketik saja.");
  }
}

// ---- Reading aloud ---------------------------------------------------------

const speakListeners = new Set<() => void>();
let speakOn: boolean | null = null;
let speechUnlocked = false;

/** This phone's storage, or undefined where even touching it throws (storage blocked). */
function phoneStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function speakSnapshot(): boolean {
  if (speakOn === null) speakOn = readSpeakChoice(phoneStorage());
  return speakOn;
}

function subscribeSpeak(listener: () => void) {
  speakListeners.add(listener);
  return () => speakListeners.delete(listener);
}

function setSpeak(on: boolean) {
  speakOn = on;
  writeSpeakChoice(phoneStorage(), on);
  speakListeners.forEach((listener) => listener());
}

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

/**
 * The speaker switch and the voice. Safari on iPhone only speaks after the
 * first speech is started by a tap, so any tap in the sheet while the
 * switch is on "unlocks" it with a silent utterance.
 */
function useReadAloud(locale: VoiceLocale, onSpeaking: (on: boolean) => void) {
  const on = useSyncExternalStore(subscribeSpeak, speakSnapshot, () => false);
  const [supported, setSupported] = useState(false);
  const voices = useRef<SpeechSynthesisVoice[]>([]);
  /** The utterance being read: a cancelled one's late "end" is ignored. */
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const speakingRef = useRef(onSpeaking);
  useEffect(() => {
    speakingRef.current = onSpeaking;
  }, [onSpeaking]);

  useEffect(() => {
    const s = synth();
    if (!s || typeof SpeechSynthesisUtterance === "undefined") return;
    setSupported(true);
    const load = () => {
      voices.current = s.getVoices();
    };
    load();
    s.addEventListener?.("voiceschanged", load);
    return () => {
      s.removeEventListener?.("voiceschanged", load);
      s.cancel();
    };
  }, []);

  const unlock = useCallback(() => {
    const s = synth();
    if (!s || speechUnlocked || typeof SpeechSynthesisUtterance === "undefined") return;
    speechUnlocked = true;
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    s.speak(silent);
  }, []);

  useEffect(() => {
    if (!on || speechUnlocked) return;
    document.addEventListener("pointerdown", unlock, { once: true, capture: true });
    return () => document.removeEventListener("pointerdown", unlock, { capture: true });
  }, [on, unlock]);

  const hush = useCallback(() => {
    const s = synth();
    current.current = null;
    if (s && (s.speaking || s.pending)) s.cancel();
    speakingRef.current(false);
  }, []);

  const say = useCallback(
    (text: string) => {
      const s = synth();
      if (!s || !speakSnapshot() || typeof SpeechSynthesisUtterance === "undefined") return;
      const words = speakable(text);
      if (!words) return;
      current.current = null;
      s.cancel();
      const utterance = new SpeechSynthesisUtterance(words);
      utterance.lang = VOICE_LANG[locale];
      const voice = pickVoice(voices.current.length ? voices.current : s.getVoices(), locale);
      if (voice) utterance.voice = voice;
      utterance.rate = 1;
      const done = () => {
        if (current.current !== utterance) return;
        current.current = null;
        speakingRef.current(false);
      };
      utterance.onend = done;
      utterance.onerror = done;
      current.current = utterance;
      speakingRef.current(true);
      s.speak(utterance);
    },
    [locale]
  );

  const toggle = useCallback(() => {
    const next = !speakSnapshot();
    setSpeak(next);
    if (next) unlock();
    else hush();
  }, [unlock, hush]);

  return useMemo(() => ({ on, supported, say, hush, unlock, toggle }), [on, supported, say, hush, unlock, toggle]);
}
