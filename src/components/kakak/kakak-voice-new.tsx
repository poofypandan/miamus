"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { AudioLines, Check, Keyboard, Loader2, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { useReadAloud } from "@/components/kakak/kakak-voice";
import { VideoTip } from "@/components/shared/video-tip";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import {
  LIMIT_NOTICE_MS,
  MAX_LISTEN_MS,
  VOICE_LANG,
  findRecognition,
  initialVoiceState,
  kakakWords,
  listenUntilDone,
  sendsSnapshots,
  voiceReducer,
  type FinishedBy,
  type Listening,
  type VoiceProblem,
  type VoiceScreen,
} from "@/lib/kakak/voice";
import { cn } from "@/lib/utils";

/** Off switch for the beta: NEXT_PUBLIC_KAKAK_VOICE=false hides it. */
const VOICE_ON = process.env.NEXT_PUBLIC_KAKAK_VOICE !== "false";

/**
 * The voice flow, the default since 20 Nov (?newvoice=0 turns it off for a
 * phone, back to kakak-voice.tsx: new-voice-switch.tsx). Nothing at all (not
 * even reading aloud) when voice is switched off.
 */
export function KakakVoiceNew(props: Parameters<typeof Voice>[0]) {
  // With voice switched off, the compact foot is still where the field lives.
  return VOICE_ON ? <Voice {...props} /> : props.compact ? <>{props.field}</> : null;
}

/** The disc's size on the first screen and in the compact row, in px. */
const BIG_DISC = 72;
const ROW_DISC = 56;

/**
 * Talk to Kakak: tap to talk, tap to end (owner, 20 Nov). A large mic in the
 * Kakak sheet: tap it and talk, as long as needed, pauses included; the words
 * appear live under the mic, and nothing happens until the owner taps again.
 * Done sends them to Kakak straight away, shown in the conversation as the
 * owner's line, with Edit words under it to fix a misheard name (kakak-sheet.tsx).
 * If listening ends any other way (the two-minute limit, or the browser
 * stopping), nothing is sent: the words go into the typing box, to check and
 * send. Her replies can be read aloud; the speaker switch is remembered on
 * this phone.
 *
 * The phone's own speech features only (src/lib/kakak/voice.ts): the
 * browser may send the audio to Apple or Google to turn it into text, but
 * Miamus never receives or stores audio, only the text, as typed Kakak does.
 */
function Voice({
  screen,
  listenHere,
  onSpoken,
  onSpeaking,
  compact = false,
  field,
  hasWords = false,
}: {
  screen: VoiceScreen;
  /**
   * Once a conversation exists (07, screen 9; Fable, 21 Nov): the foot is one
   * row, the mic at 56 px and then the field, with Read replies aloud under
   * it. Listening still opens the full panel, and folds back to the row.
   */
  compact?: boolean;
  /** The typing field for the compact row (kakak-sheet.tsx's TypingBox). */
  field?: ReactNode;
  /** The field has words: Send is the solid shape, so the mic goes quiet. */
  hasWords?: boolean;
  /** A reply starts or stops being read aloud: her heart follows it (the warm seal, 20 Nov). */
  onSpeaking?: (on: boolean) => void;
  /** Whether a spoken answer makes sense on this screen. */
  listenHere: boolean;
  /**
   * Listening ended with these words. `by` "owner" (the Done tap): send them.
   * Otherwise (the limit, the browser): put them in the typing box, unsent.
   */
  onSpoken: (text: string, by: FinishedBy) => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const [state, dispatch] = useReducer(voiceReducer, true, initialVoiceState);
  const [ready, setReady] = useState(false);
  /** Listening was ended by the limit or the browser: the words wait in the typing box for Send. */
  const [kept, setKept] = useState<Exclude<FinishedBy, "owner"> | null>(null);
  /** Seconds left before the safety limit, from LIMIT_NOTICE_MS on; null before. */
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const noticeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const listening = useRef<Listening | null>(null);
  const speaker = useReadAloud(locale, (on) => {
    dispatch({ type: "speaking", on });
    onSpeaking?.(on);
  });

  // The latest callback, so the recognizer's handlers never call a stale one.
  const spoken = useRef(onSpoken);
  useEffect(() => {
    spoken.current = onSpoken;
  }, [onSpoken]);

  const clearNotice = useCallback(() => {
    noticeTimers.current.forEach((timer) => clearTimeout(timer));
    noticeTimers.current = [];
    setSecondsLeft(null);
  }, []);

  /** The quiet countdown before the limit: one timer per second from LIMIT_NOTICE_MS. */
  const startNotice = useCallback(() => {
    clearNotice();
    for (let at = LIMIT_NOTICE_MS; at < MAX_LISTEN_MS; at += 1000) {
      const left = Math.round((MAX_LISTEN_MS - at) / 1000);
      noticeTimers.current.push(setTimeout(() => setSecondsLeft(left), at));
    }
  }, [clearNotice]);

  // Whether this browser can listen at all, known only in the browser.
  useEffect(() => {
    if (!findRecognition()) dispatch({ type: "problem", problem: "unavailable" });
    setReady(true);
    return () => {
      listening.current?.cancel();
      noticeTimers.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const busy = screen.kind === "waiting";
  useEffect(() => {
    // Sent by typing while the mic was still on: drop the listening, or its
    // words would be sent a second time.
    if (busy && listening.current) {
      listening.current.cancel();
      listening.current = null;
      clearNotice();
      dispatch({ type: "stop" });
    }
    dispatch({ type: "thinking", on: busy });
    if (busy) setKept(null);
  }, [busy, clearNotice]);

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
    setKept(null);
    dispatch({ type: "listen" });
    startNotice();
    const snapshots = sendsSnapshots(navigator.userAgent);
    listening.current = listenUntilDone(Ctor, VOICE_LANG[locale], {
      onHeard: (text) => dispatch({ type: "heard", transcript: text }),
      onFinished: (text, by = "browser") => {
        listening.current = null;
        clearNotice();
        dispatch({ type: "done" });
        setKept(by === "owner" ? null : by);
        spoken.current(text, by);
      },
      onProblem: (problem) => {
        listening.current = null;
        clearNotice();
        dispatch({ type: "problem", problem });
      },
    }, { snapshots });
  }, [locale, speaker, startNotice, clearNotice]);

  const stop = useCallback(() => {
    if (state.phase === "listening") listening.current?.finish();
    else if (state.phase === "speaking") speaker.hush();
  }, [state.phase, speaker]);

  const cancel = useCallback(() => {
    listening.current?.cancel();
    listening.current = null;
    clearNotice();
    dispatch({ type: "stop" });
  }, [clearNotice]);

  if (!ready) return compact ? <>{field}</> : null;

  const { phase } = state;
  const chip = speaker.supported && (
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
  );

  if (compact && phase !== "listening") {
    return (
      <section aria-label={t("Talk to Kakak", "Bicara dengan Kakak")} className="flex flex-col gap-2.5 pt-1">
        {phase === "speaking" && (
          <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <AudioLines className="size-4 shrink-0 motion-safe:animate-pulse" aria-hidden="true" />
            {t("Kakak is speaking", "Kakak sedang bicara")}
          </p>
        )}
        {/* minmax(0, 1fr): a long typed line never pushes the row sideways. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2.5">
          {state.canListen || phase === "speaking" ? (
            <RowButton phase={phase} quiet={hasWords && phase === "idle"} disabled={!listenHere && phase !== "speaking"} onListen={start} onStop={stop} />
          ) : (
            <span />
          )}
          <div className="min-w-0">{field}</div>
        </div>
        {state.problem && phase === "idle" && state.canListen && (
          <p className="text-center text-sm text-muted-foreground">{problemText(state.problem, t)}</p>
        )}
        {chip}
      </section>
    );
  }

  const showMic = state.canListen && (listenHere || phase === "listening");
  const showBig = showMic || phase === "speaking";
  const showTip = !state.canListen && listenHere;
  if (!showBig && !showTip && !speaker.supported) return null;

  return (
    <>
      {/* Once, above the mic: tap to talk, tap Done to send (kakak-voice-2026-11 describes the older flow, Tap Stop). */}
      {showMic && phase === "idle" && screen.kind === "typing" && <WhatsNewCard id="kakak-tap-to-talk-2026-11" />}
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
              {phaseLabel(phase, kept, t)}
            </p>
            {phase === "listening" && (
              // The words as they are heard, marked as still listening. Not
              // in the typing box yet: that waits for Done.
              <div
                data-testid="kakak-live-words"
                // A quiet paper inset, full width, starting from the left so the
                // words don't shift as they grow (Fable, #187).
                className="flex w-full items-start gap-2 rounded-2xl bg-background px-4 py-3 text-base"
              >
                <AudioLines className="mt-0.5 size-5 shrink-0 text-foreground motion-safe:animate-pulse" aria-hidden="true" />
                <p className={cn("min-w-0 flex-1 break-words", state.transcript ? "text-foreground" : "text-muted-foreground")}>
                  {state.transcript || t("Say what you need. Pauses are fine.", "Sebutkan yang Anda perlukan. Boleh sambil berpikir.")}
                </p>
              </div>
            )}
            {phase === "listening" && secondsLeft !== null && (
              // Quiet, from 1:45: the two-minute limit is close.
              <p data-testid="kakak-limit-notice" className="text-center text-sm text-muted-foreground">
                {t(
                  `Listening stops in ${secondsLeft} s. Tap Done to send.`,
                  `Kakak berhenti mendengarkan dalam ${secondsLeft} detik. Ketuk Selesai untuk mengirim.`
                )}
              </p>
            )}
            {phase === "listening" && (
              <button
                type="button"
                onClick={cancel}
                className="min-h-11 text-sm font-medium text-muted-foreground underline-offset-4 active:underline"
              >
                {t("Cancel", "Batalkan")}
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

        {/* Hidden while listening in the compact foot (Fable, 21 Nov). */}
        {!compact && chip}
      </section>
    </>
  );
}

function BigButton({ phase, onListen, onStop }: { phase: string; onListen: () => void; onStop: () => void }) {
  const t = useT();
  const disc = useRef<HTMLButtonElement>(null);
  // Its place on screen, kept for the compact row's disc to travel from (only
  // when idle on the first screen; after listening the panel folds back in place).
  useLayoutEffect(() => {
    const el = disc.current;
    if (el && phase === "idle") lastBigDisc.rect = el.getBoundingClientRect();
  });
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
        ref={disc}
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

function phaseLabel(
  phase: string,
  kept: Exclude<FinishedBy, "owner"> | null,
  t: (en: string, id: string) => string
): React.ReactNode {
  switch (phase) {
    case "listening":
      return t("Listening. Tap Done to send.", "Kakak mendengarkan. Ketuk Selesai untuk mengirim.");
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
      return kept === "limit"
        ? t("Listening stopped at 2 minutes. Check the words, then tap Send.", "Kakak berhenti mendengarkan setelah 2 menit. Cek kata-katanya, lalu ketuk Kirim.")
        : kept === "browser"
          ? t("Listening stopped. Check the words, then tap Send.", "Kakak berhenti mendengarkan. Cek kata-katanya, lalu ketuk Kirim.")
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

/**
 * The compact row's mic (Fable, 21 Nov): the same three jobs as the big disc
 * at 56 px. Solid, unless the field has words: then Send is the solid shape
 * and the mic goes quiet. When it first appears, it travels from where the
 * big disc was and settles from 72 to 56 px on ease-travel (at once under
 * reduced motion).
 */
function RowButton({
  phase,
  quiet,
  disabled,
  onListen,
  onStop,
}: {
  phase: string;
  quiet: boolean;
  disabled: boolean;
  onListen: () => void;
  onStop: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const from = lastBigDisc.rect;
    lastBigDisc.rect = null;
    if (!el || !from || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${BIG_DISC / ROW_DISC})` }, { transform: "none" }],
      { duration: 320, easing: "cubic-bezier(0.65, 0, 0.35, 1)" }
    );
  }, []);
  const speaking = phase === "speaking";
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || phase === "thinking"}
      onClick={speaking ? onStop : onListen}
      aria-label={
        speaking ? t("Stop", "Berhenti") : phase === "thinking" ? t("Kakak is thinking", "Kakak sedang berpikir") : t("Talk to Kakak", "Bicara dengan Kakak")
      }
      className={cn(
        "flex size-14 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
        // While she thinks, her dots are the one sign: the disc goes quiet and its mic dims (Fable, #192).
        phase === "thinking"
          ? "bg-muted text-subtle-foreground"
          : quiet
            ? "bg-muted text-foreground"
            : "bg-primary text-primary-foreground shadow-sm disabled:opacity-60"
      )}
    >
      {speaking ? (
        <Square className="size-5 fill-current" aria-hidden="true" />
      ) : (
        <Mic className="size-6" aria-hidden="true" />
      )}
    </button>
  );
}

/** Where the big disc last sat on screen, so the row's disc can travel from it. */
const lastBigDisc: { rect: DOMRect | null } = { rect: null };
