"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AudioLines, Check, Keyboard, Loader2, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { useReadAloud } from "@/components/kakak/kakak-voice";
import { VideoTip } from "@/components/shared/video-tip";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import {
  VOICE_LANG,
  findRecognition,
  initialVoiceState,
  kakakWords,
  listenUntilDone,
  sendsSnapshots,
  voiceReducer,
  type Listening,
  type VoiceProblem,
  type VoiceScreen,
} from "@/lib/kakak/voice";
import { cn } from "@/lib/utils";

/** Off switch for the beta: NEXT_PUBLIC_KAKAK_VOICE=false hides it. */
const VOICE_ON = process.env.NEXT_PUBLIC_KAKAK_VOICE !== "false";

/**
 * The new voice flow, opt-in per phone with ?newvoice=1 while the owner tries
 * it (new-voice-switch.tsx); kakak-voice.tsx is the current one. Nothing at
 * all (not even reading aloud) when voice is switched off.
 */
export function KakakVoiceNew(props: Parameters<typeof Voice>[0]) {
  return VOICE_ON ? <Voice {...props} /> : null;
}

/**
 * Talk to Kakak (voice beta). A large mic in the Kakak sheet: tap it and
 * talk, as long as needed, pauses included; the words appear live under the
 * mic. Tap Done and they go into the typing box, where the owner can fix a
 * misheard name before tapping Send, as if typed. Her replies can be read
 * aloud; the speaker switch is remembered on this phone.
 *
 * The phone's own speech features only (src/lib/kakak/voice.ts): the
 * browser may send the audio to Apple or Google to turn it into text, but
 * Miamus never receives or stores audio, only the text, as typed Kakak does.
 */
function Voice({
  screen,
  listenHere,
  onReview,
}: {
  screen: VoiceScreen;
  /** Whether a spoken answer makes sense on this screen. */
  listenHere: boolean;
  /** Done: put these words in the typing box, to check and send. Nothing is sent. */
  onReview: (text: string) => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const [state, dispatch] = useReducer(voiceReducer, true, initialVoiceState);
  const [ready, setReady] = useState(false);
  /** Spoken words are in the typing box, waiting for Send. */
  const [reviewing, setReviewing] = useState(false);
  const listening = useRef<Listening | null>(null);
  const speaker = useReadAloud(locale, (on) => dispatch({ type: "speaking", on }));

  // The latest callback, so the recognizer's handlers never call a stale one.
  const review = useRef(onReview);
  useEffect(() => {
    review.current = onReview;
  }, [onReview]);

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
    if (busy) setReviewing(false);
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
    setReviewing(false);
    dispatch({ type: "listen" });
    const snapshots = sendsSnapshots(navigator.userAgent);
    listening.current = listenUntilDone(Ctor, VOICE_LANG[locale], {
      onHeard: (text) => dispatch({ type: "heard", transcript: text }),
      onFinished: (text) => {
        listening.current = null;
        dispatch({ type: "done" });
        setReviewing(true);
        review.current(text);
      },
      onProblem: (problem) => {
        listening.current = null;
        dispatch({ type: "problem", problem });
      },
    }, { snapshots });
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
  const showMic = state.canListen && (listenHere || phase === "listening");
  const showBig = showMic || phase === "speaking";
  const showTip = !state.canListen && listenHere;
  if (!showBig && !showTip && !speaker.supported) return null;

  return (
    <>
      {/* No tutorial card while this flow is opt-in: kakak-voice-2026-11 describes the current one (Tap Stop). */}
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
              {phaseLabel(phase, reviewing, t)}
            </p>
            {phase === "listening" && (
              // The words as they are heard, marked as still listening. Not
              // in the typing box yet: that waits for Done.
              <div
                data-testid="kakak-live-words"
                className="flex w-full items-start gap-2 rounded-2xl border border-primary/20 bg-card px-3 py-2 text-sm"
              >
                <AudioLines className="mt-0.5 size-4 shrink-0 text-primary motion-safe:animate-pulse" aria-hidden="true" />
                <p className={cn("min-w-0 flex-1 break-words", state.transcript ? "text-gray-900" : "text-muted-foreground")}>
                  {state.transcript || t("Say what you need. Pauses are fine.", "Sebutkan yang Anda perlukan. Boleh sambil berpikir.")}
                </p>
              </div>
            )}
            {phase === "listening" && (
              <button
                type="button"
                onClick={cancel}
                className="min-h-9 text-xs font-medium text-muted-foreground underline-offset-4 active:underline"
              >
                {t("Cancel", "Batalkan")}
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
  const done = t("Done", "Selesai");
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
          phase === "listening"
            ? done
            : active
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
        ) : phase === "listening" ? (
          <span className="flex flex-col items-center gap-0.5" aria-hidden="true">
            <Check className="size-6" />
            <span className="text-[11px] font-semibold leading-none">{done}</span>
          </span>
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

function phaseLabel(phase: string, reviewing: boolean, t: (en: string, id: string) => string): React.ReactNode {
  switch (phase) {
    case "listening":
      return t("Listening. Tap Done when you're finished.", "Kakak mendengarkan. Ketuk Selesai kalau sudah.");
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
      return reviewing
        ? t("Check the words, then tap Send.", "Cek kata-katanya, lalu ketuk Kirim.")
        : t("Tap and talk", "Ketuk lalu bicara");
  }
}

function problemText(problem: VoiceProblem, t: (en: string, id: string) => string): string {
  switch (problem) {
    case "quiet":
      return t("I didn't hear anything. Tap the mic and try again, or type.", "Kakak belum mendengar apa-apa. Ketuk mikrofon dan coba lagi, atau ketik saja.");
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
