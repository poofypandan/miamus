"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { AudioLines, Keyboard, Loader2, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { VideoTip } from "@/components/shared/video-tip";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import {
  VOICE_LANG,
  findRecognition,
  initialVoiceState,
  kakakWords,
  listenOnce,
  pickVoice,
  readSpeakChoice,
  voiceReducer,
  writeSpeakChoice,
  type Listening,
  type VoiceLocale,
  type VoiceProblem,
  type VoiceScreen,
} from "@/lib/kakak/voice";
import { SPEECH_RATE, speechPlan } from "@/lib/kakak/speech";
import {
  fetchKakakAudio,
  reportOutcome,
  shouldPrimeAudio,
  silentWav,
  spokenText,
  type VoiceOutcome,
} from "@/lib/kakak/app-voice";
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
 * Her replies are read in her own voice when the server has it
 * (/api/kakak/speak), in the phone's voice otherwise.
 */
function Voice({
  screen,
  listenHere,
  inputShown,
  onHeard,
  onSpoken,
  onSpeaking,
}: {
  screen: VoiceScreen;
  /** A reply starts or stops being read aloud: her heart follows it (the warm seal, 20 Nov). */
  onSpeaking?: (on: boolean) => void;
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
  const speaker = useReadAloud(locale, (on) => {
    dispatch({ type: "speaking", on });
    onSpeaking?.(on);
  });

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

  // Read each new reply aloud, if the speaker is on. Keyed by the reply
  // itself (its kind, request and own words), not by the card's items, so
  // dropping an item doesn't read the card again; and never while the mic
  // is listening, or the reading would be heard as the owner's words.
  const words = kakakWords(screen, locale);
  const replyKey = `${screen.kind}|${screen.requestId ?? ""}|${screen.question ?? screen.text ?? ""}`;
  const say = speaker.say;
  useEffect(() => {
    if (words && !listening.current) say(words);
  }, [replyKey, say]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by replyKey on purpose

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
          // The mic in the open, with air around it (07, decision 7): the disc
          // is the screen's one solid shape. The keyboard tip keeps a quiet inset.
          showTip && "rounded-[22px] bg-background",
          showBig ? "pb-2 pt-4" : showTip ? "px-3 py-2" : "py-0"
        )}
      >
        {showBig && (
          <>
            <BigButton phase={phase} onListen={start} onStop={stop} />
            <p role="status" aria-live="polite" className="min-h-5 text-center text-base font-medium text-foreground">
              {phaseLabel(phase, t)}
            </p>
            {phase === "listening" && !inputShown && state.transcript && (
              // No typing box on this screen (Kakak's question): the live
              // words show here, so nothing heard is hidden.
              <p className="max-w-full rounded-[20px] rounded-br-md bg-muted px-4 py-2.5 text-base text-foreground">
                {state.transcript}
              </p>
            )}
            {phase === "listening" && (
              <button
                type="button"
                onClick={cancel}
                className="min-h-11 text-sm font-medium text-muted-foreground underline-offset-4 active:underline"
              >
                {t("Cancel, don't send", "Batal, jangan kirim")}
              </button>
            )}
            {state.problem && phase === "idle" && state.canListen && (
              <p className="text-center text-sm text-muted-foreground">{problemText(state.problem, t)}</p>
            )}
          </>
        )}

        {showTip && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Keyboard className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {t("Tap the mic on your keyboard and speak.", "Ketuk mic di keyboard, lalu bicara.")}
            </span>
          </p>
        )}
        {showTip && (
          <VideoTip id="owner-kakak-voice" locale={locale} />
        )}

        {speaker.supported && (
          <button
            type="button"
            aria-pressed={speaker.on}
            onClick={() => speaker.toggle()}
            className={cn(
              // One quiet chip with no outline (04, PR 5); on, it takes her blush, since it is her voice.
              "flex min-h-[38px] items-center gap-1.5 self-center rounded-full px-3.5 text-sm font-medium",
              speaker.on ? "bg-kakak-tint text-foreground active:bg-kakak-line" : "bg-muted text-muted-foreground active:bg-muted/70"
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

// ---- Kakak's own voice (src/lib/kakak/app-voice.ts) ---------------------------

/**
 * Whether the server has Kakak's ElevenLabs voice set up, asked once per
 * visit. Until it says "on", and for the rest of the visit once it says
 * "off" (not set up, the day's budget used), the phone's voice reads aloud.
 */
let appVoice: "unknown" | "checking" | "on" | "off" = "unknown";
let audioElement: HTMLAudioElement | null = null;
let audioUnlocked = false;
/** The check in flight, so a reply that arrives before it answers waits for it. */
let appVoiceCheck: Promise<void> | null = null;
/** How long a reply waits for that check before the phone's voice reads it. */
const CHECK_WAIT_MS = 3_000;

function checkAppVoice(): Promise<void> {
  if (appVoice === "checking" && appVoiceCheck) return appVoiceCheck;
  if (appVoice !== "unknown" || typeof fetch === "undefined") return Promise.resolve();
  appVoice = "checking";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  appVoiceCheck = fetch("/api/kakak/speak", { cache: "no-store", signal: controller.signal })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { kind?: string } | null) => {
      appVoice = body?.kind === "on" ? "on" : "off";
    })
    .catch(() => {
      appVoice = "unknown"; // offline: ask again next time
    })
    .finally(() => {
      clearTimeout(timer);
      appVoiceCheck = null;
    });
  return appVoiceCheck;
}

/** One element for every reply, so the tap that unlocked it on iPhone keeps counting. */
function kakakAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  audioElement ??= new Audio();
  return audioElement;
}

/** What is being read now. */
interface ReadingRun {
  /** The pause before the phone voice's next sentence. */
  timer: ReturnType<typeof setTimeout> | null;
  /** Cancels the request for Kakak's audio. */
  abort: AbortController;
  /** Kakak's audio, while it plays. */
  url: string | null;
}

/**
 * The speaker switch and the voice. Kakak's own voice when the server has it
 * (POST /api/kakak/speak), the phone's voice otherwise or on any failure.
 * Safari on iPhone only speaks, and only plays audio, after the first one is
 * started by a tap, so any tap in the sheet while the switch is on "unlocks"
 * both with a silent utterance and a silent sound.
 */
export function useReadAloud(locale: VoiceLocale, onSpeaking: (on: boolean) => void) {
  const on = useSyncExternalStore(subscribeSpeak, speakSnapshot, () => false);
  const { activeHouseholdId } = useHousehold();
  const [supported, setSupported] = useState(false);
  const voices = useRef<SpeechSynthesisVoice[]>([]);
  /**
   * The reply being read and how. Replaced or cleared when reading stops, so
   * a stopped reply's late "end", pending pause or late audio never starts
   * anything.
   */
  const reading = useRef<ReadingRun | null>(null);
  const speakingRef = useRef(onSpeaking);
  useEffect(() => {
    speakingRef.current = onSpeaking;
  }, [onSpeaking]);

  /** Drop what is queued or playing for this reply (the phone voice itself is cancelled by the caller). */
  const dropQueue = useCallback(() => {
    const run = reading.current;
    reading.current = null;
    if (!run) return;
    if (run.timer) clearTimeout(run.timer);
    run.abort.abort();
    if (run.url) {
      const audio = kakakAudio();
      if (audio) {
        audio.onended = audio.onerror = null;
        audio.pause();
        audio.removeAttribute("src");
      }
      URL.revokeObjectURL(run.url);
      run.url = null;
    }
  }, []);

  useEffect(() => {
    if (on) checkAppVoice();
  }, [on]);

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
      // The sheet closed: nothing more is read, not even the queued sentences.
      s.removeEventListener?.("voiceschanged", load);
      s.cancel();
    };
  }, []);

  // The sheet closed: Kakak's audio stops too.
  useEffect(() => () => dropQueue(), [dropQueue]);

  const unlock = useCallback(() => {
    const s = synth();
    if (s && !speechUnlocked && typeof SpeechSynthesisUtterance !== "undefined") {
      speechUnlocked = true;
      const silent = new SpeechSynthesisUtterance(" ");
      silent.volume = 0;
      s.speak(silent);
    }
    // src/lib/kakak/app-voice.ts shouldPrimeAudio: also before the server
    // has answered, since the tap that sends the first question is often the
    // only one before her reply arrives.
    const prime = shouldPrimeAudio({ appVoice, unlocked: audioUnlocked, playing: Boolean(reading.current?.url) });
    const audio = prime ? kakakAudio() : null;
    if (audio) {
      audioUnlocked = true;
      audio.src = silentWav();
      void audio.play().catch((error: { name?: string }) => {
        // Cut short by her reply's own audio is still an unlock; refused isn't.
        if (error?.name === "NotAllowedError") audioUnlocked = false;
      });
    }
  }, []);

  useEffect(() => {
    if (!on) return;
    // Every tap while the switch is on: whether Kakak's voice is on may only
    // be known after the first one, and a refused play() (autoplay) needs a
    // new tap. unlock() does nothing while both are unlocked.
    document.addEventListener("pointerdown", unlock, { capture: true });
    document.addEventListener("click", unlock, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", unlock, { capture: true });
      document.removeEventListener("click", unlock, { capture: true });
    };
  }, [on, unlock]);

  const hush = useCallback(() => {
    const s = synth();
    dropQueue();
    if (s && (s.speaking || s.pending)) s.cancel();
    speakingRef.current(false);
  }, [dropQueue]);

  /**
   * Read a reply the way a person would (src/lib/kakak/speech.ts): times and
   * symbols in words. In Kakak's own voice when the server has it and it
   * answers within AUDIO_WAIT_MS; otherwise the phone's voice, a little
   * slower than its default, one sentence at a time with a short breath
   * between, at the voice's own pitch.
   */
  const say = useCallback(
    (text: string) => {
      const s = synth();
      if (!speakSnapshot()) return;
      const plan = speechPlan(text, locale);
      if (!plan.length) return;
      dropQueue();
      s?.cancel();
      const run: ReadingRun = { timer: null, abort: new AbortController(), url: null };
      reading.current = run;
      const finish = () => {
        if (reading.current !== run) return;
        dropQueue();
        speakingRef.current(false);
      };

      /** The phone's own voice, as before Kakak had hers. */
      const readOnPhone = (reason?: VoiceOutcome) => {
        if (reading.current !== run) return;
        if (reason) reportOutcome(reason);
        if (!s || typeof SpeechSynthesisUtterance === "undefined") return finish();
        const voice = pickVoice(voices.current.length ? voices.current : s.getVoices(), locale);
        const read = (index: number) => {
          run.timer = null;
          if (reading.current !== run) return;
          const part = plan[index];
          const utterance = new SpeechSynthesisUtterance(part.text);
          utterance.lang = VOICE_LANG[locale];
          if (voice) utterance.voice = voice;
          utterance.rate = SPEECH_RATE;
          let settled = false;
          utterance.onend = () => {
            if (settled || reading.current !== run) return;
            settled = true;
            if (index + 1 >= plan.length) finish();
            else run.timer = setTimeout(() => read(index + 1), part.pauseAfterMs);
          };
          utterance.onerror = () => {
            if (settled) return;
            settled = true;
            finish();
          };
          s.speak(utterance);
        };
        read(0);
      };

      /** Kakak's own voice; the phone's if the audio won't play. */
      const play = (blob: Blob) => {
        const audio = kakakAudio();
        if (!audio || reading.current !== run) return readOnPhone(audio ? undefined : "unplayable");
        let started = false;
        let fellBack = false;
        /** Once only: a failed sound can both fire "error" and reject play(). */
        const fallBack = (reason: VoiceOutcome) => {
          if (fellBack || reading.current !== run) return;
          fellBack = true;
          audio.onended = audio.onerror = null;
          audio.pause();
          if (run.url) URL.revokeObjectURL(run.url);
          run.url = null;
          readOnPhone(reason);
        };
        run.url = URL.createObjectURL(blob);
        audio.onplaying = () => {
          if (!started) reportOutcome("played");
          started = true;
        };
        audio.onended = () => finish();
        audio.onerror = () => (started ? finish() : fallBack("unplayable"));
        audio.src = run.url;
        audio.play().catch((error: { name?: string }) => {
          // NotAllowedError: the browser wants a tap first (autoplay). The
          // next tap in the sheet unlocks it again.
          if (error?.name === "NotAllowedError") audioUnlocked = false;
          fallBack(error?.name === "NotAllowedError" ? "autoplay" : "unplayable");
        });
      };

      /** Kakak's audio from the server; the phone's voice, with the reason, otherwise. */
      const askForAudio = (householdId: string) => {
        if (reading.current !== run) return;
        void fetchKakakAudio({
          householdId,
          text: spokenText(text, locale),
          locale,
          signal: run.abort.signal,
        }).then((result) => {
          if (reading.current !== run) return;
          if (result.kind === "audio") return play(result.audio);
          if (result.kind === "phone_today") appVoice = "off";
          readOnPhone(result.reason);
        });
      };

      speakingRef.current(true);
      const householdId = activeHouseholdId;
      if (!householdId) return readOnPhone();
      if (appVoice === "checking") {
        // The reply came back before the check did: wait for it (a little),
        // then decide. askForAudio and readOnPhone do nothing if the reply
        // was stopped or replaced meanwhile.
        void Promise.race([checkAppVoice(), new Promise((resolve) => setTimeout(resolve, CHECK_WAIT_MS))]).then(() =>
          appVoice === "on" ? askForAudio(householdId) : readOnPhone(appVoice === "checking" ? "timeout" : undefined)
        );
        return;
      }
      if (appVoice !== "on") return readOnPhone();
      askForAudio(householdId);
    },
    [locale, dropQueue, activeHouseholdId]
  );

  const toggle = useCallback(() => {
    const next = !speakSnapshot();
    setSpeak(next);
    if (next) {
      checkAppVoice();
      unlock();
    } else hush();
  }, [unlock, hush]);

  return useMemo(() => ({ on, supported, say, hush, unlock, toggle }), [on, supported, say, hush, unlock, toggle]);
}
