"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Carrot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  CookingPot,
  Eye,
  Gauge,
  Hourglass,
  Lightbulb,
  ListChecks,
  Loader2,
  MessageSquare,
  PawPrint,
  Pencil,
  Refrigerator,
  RotateCcw,
  Send,
  ShoppingBasket,
  ShoppingCart,
  Undo2,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { KAKAK_SETTLE_MS, KakakAvatar, type KakakBeat } from "@/components/kakak/kakak-avatar";
import { KakakExamples } from "@/components/kakak/kakak-examples";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { KakakThinking } from "@/components/kakak/kakak-thinking";
import { KakakVoice } from "@/components/kakak/kakak-voice";
import { KakakVoiceNew } from "@/components/kakak/kakak-voice-new";
import { useNewVoice } from "@/components/kakak/new-voice-switch";
import { KakakRemindChips } from "@/components/kakak/kakak-remind-chips";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { askKakak, historyForNextTurn, reportKakakOutcome, type KakakFailure, type KakakReply } from "@/lib/kakak/client";
import { addsSomething, choreGlance, describeSuggestion, routineListLine, savedBenefit, savedSummary } from "@/lib/kakak/describe";
import { routineKindInfo } from "@/lib/pet-routine-kinds";
import type { RoutineKind } from "@/types/database";
import { MAX_TYPED, type KakakHistory, type RefusalReason } from "@/lib/kakak/engine";
import { staffAreasNobody, type KakakSuggestion } from "@/lib/kakak/suggestions";
import { useKakakSave } from "@/lib/kakak/use-kakak-save";
import { FoodRulesChips } from "@/components/kitchen/food-rules-chips";
import { FOOD_RULES_PRESETS, foodRulesReply, type FoodRule } from "@/lib/food-preferences";
import { saveFoodPreferences } from "@/lib/menu-store";
import { firstName } from "@/lib/kakak/context";
import {
  REPEAT_CHOICES,
  refineChore,
  refinePetRoutine,
  refinementNote,
  repeatLabel,
  type ChoreRefinement,
  type PetRoutineRefinement,
} from "@/lib/kakak/refine";
import type { ChoreSuggestion } from "@/lib/kakak/suggestions";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import type { HouseholdLocation } from "@/types/database";
import { nameSaysPlace } from "@/lib/room-in-name";
import { cn } from "@/lib/utils";

type Screen =
  | { kind: "typing" }
  | { kind: "waiting" }
  /** `foodRules`: the app's own food-rules card (PR C2, D2), with Remember for next time. */
  | { kind: "question"; question: string; answers: string[]; allowTyping: boolean; foodRules?: boolean }
  /** `refined`: the owner adjusted the card with its chips before saving. */
  | { kind: "card"; text: string; items: KakakSuggestion[]; requestId: string; refined?: boolean }
  | { kind: "message"; text: string; problem?: Problem }
  /** A card with a pet routine was saved (Phase 173 PR B): Kakak says what it means, with Undo. */
  | { kind: "saved"; text: string; items: KakakSuggestion[]; undo: () => Promise<boolean>; requestId: string; refined: boolean };

/**
 * When a turn could not be answered: what to show and what the owner can do
 * next — try the same words again (no internet, busy, too slow), say it
 * another way, start a new conversation, or nothing but add it by hand.
 */
interface Problem {
  icon: LucideIcon;
  next: "retry" | "rephrase" | "restart" | "none";
}

/** Saved — Undo stays on screen long enough to read the toast and reach it. */
const UNDO_TOAST_MS = 8000;

/**
 * Tell Kakak (Phase 156 step 2; plan screens 2–8). One typing box, then
 * Kakak's question with answer buttons or her confirmation card. Nothing is
 * saved until the owner taps Looks right, and then through the same actions
 * as adding it by hand. The conversation lives here, in the open sheet, and
 * is forgotten when it closes.
 */
export function KakakSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Something was saved and the sheet closed on it: the opener's mark can settle (the warm seal, 20 Nov). */
  onSaved?: () => void;
}) {
  useBackToClose(open, onClose);
  const t = useT();
  /** What her heart in the header is doing: following her voice, or the saved settle. */
  const [beat, setBeat] = useState<KakakBeat | null>(null);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl pb-safe">
        {/* Her lock-up (the warm seal, 20 Nov): the mark on the left, her name
            beside it in the app's face, semi-bold and slightly tight. */}
        <SheetHeader className="flex-row items-center gap-3 px-4 pb-2 pt-4 text-left">
          <KakakAvatar className="size-10" beat={open ? beat : null} />
          <div className="min-w-0">
            <SheetTitle className="text-lg leading-tight font-semibold tracking-[-0.01em]">Kakak</SheetTitle>
            <SheetDescription className="text-xs">
              {t("Nothing is saved until you confirm.", "Tidak ada yang disimpan sebelum Anda konfirmasi.")}
            </SheetDescription>
          </div>
        </SheetHeader>
        {/* Keyed by open: each opening starts a new conversation. */}
        {open && <Conversation onClose={onClose} onSaved={onSaved} onBeat={setBeat} />}
      </SheetContent>
    </Sheet>
  );
}

function Conversation({
  onClose,
  onSaved,
  onBeat,
}: {
  onClose: () => void;
  onSaved?: () => void;
  onBeat: (beat: KakakBeat | null) => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const { activeHouseholdId } = useHousehold();
  const save = useKakakSave();
  /** The voice flow (tap to talk, tap Done to send), the default; ?newvoice=0 turns it off on this phone. */
  const newVoice = useNewVoice();
  const [screen, setScreen] = useState<Screen>({ kind: "typing" });
  /** A reply is being read aloud (the voice beta tells): her heart follows it. */
  const [speaking, setSpeaking] = useState(false);
  /** The saved routine's one settle, just as it lands (not again after its benefit is read aloud). */
  const [settling, setSettling] = useState(false);
  const saved = screen.kind === "saved";
  useEffect(() => {
    if (!saved) return;
    setSettling(true);
    const timer = window.setTimeout(() => setSettling(false), KAKAK_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [saved]);
  // Her heart in the header (the warm seal, 20 Nov): a gentle beat while she
  // speaks, one settle when a routine is saved here; still otherwise, and
  // still again once this conversation closes.
  const beat: KakakBeat | null = speaking ? "speak" : settling ? "settle" : null;
  useEffect(() => {
    onBeat(beat);
  }, [beat, onBeat]);
  useEffect(() => () => onBeat(null), [onBeat]);
  const [history, setHistory] = useState<KakakHistory | null>(null);
  /**
   * The conversation so far, both sides (2026-11-14): what the owner wrote,
   * so they see what Kakak read, and what Kakak said before her latest
   * reply. With the owner's lines alone, three in a row read as if she had
   * ignored the first two.
   */
  const [said, setSaid] = useState<SaidLine[]>([]);
  const [draft, setDraft] = useState("");
  const [typingAnswer, setTypingAnswer] = useState(false);
  /**
   * The owner's latest line was spoken and sent by Done: what to put back if
   * they tap Edit words under it (a misheard name). Cleared by the next send.
   */
  const [spokenTurn, setSpokenTurn] = useState<SpokenTurn | null>(null);
  const [saving, setSaving] = useState(false);
  /** The server answered in practice mode (scripted, no AI): say so. */
  const [practice, setPractice] = useState(false);
  const abort = useRef<AbortController | null>(null);
  /** The last words sent and the history they went with, for "Try again". */
  const lastTurn = useRef<{ words: string; history: KakakHistory | null } | null>(null);
  /** The owner's latest line, which the sheet scrolls to as the conversation grows. */
  const latestSaid = useRef<HTMLParagraphElement>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // From the second exchange on, the owner's latest words go to the top of
  // the sheet, so Kakak's reply to them, her card and the mic under it stay
  // in view instead of sliding below the earlier lines.
  const lines = said.length;
  const showing = screen.kind;
  useEffect(() => {
    if (lines < 3) return;
    latestSaid.current?.scrollIntoView({ block: "start" });
  }, [lines, showing]);

  async function send(text: string, { spoken = false }: { spoken?: boolean } = {}) {
    const typed = text.trim();
    if (!typed) return;
    setSpokenTurn(spoken ? { words: typed.slice(0, MAX_TYPED), screen, history, said, typingAnswer } : null);
    // A correction after the card's chips carries what they changed, so
    // Kakak's next card keeps it (Codex, PR #68). The owner's words are
    // never cut for it: the note shrinks to the room left, or is left out.
    // The owner's line shows only what they typed.
    const own = typed.slice(0, MAX_TYPED);
    const note = screen.kind === "card" && screen.refined ? refinementNote(screen.items, MAX_TYPED - own.length - 1) : "";
    const words = note ? `${note} ${own}` : own;
    // Kakak's line the owner is answering stays above their answer.
    const hers = kakakLine(screen, t("Here's what I'll add:", "Ini yang akan Kakak tambahkan:"));
    setSaid((list) => [...list, ...(hers ? [{ who: "kakak" as const, text: hers }] : []), { who: "owner" as const, text: own, spoken }]);
    setDraft("");
    setTypingAnswer(false);
    // After her plain reply the conversation is at rest: a long one starts
    // afresh here, so the owner can keep asking (lib/kakak/client.ts).
    const atRest = screen.kind === "message" && !screen.problem;
    await ask(words, historyForNextTurn(history, atRest));
  }

  /** The same words again, after no internet, a busy Kakak or a timeout. */
  function retry() {
    if (lastTurn.current) void ask(lastTurn.current.words, lastTurn.current.history);
  }

  /**
   * Edit words under a spoken line (20 Nov): Kakak's answer to it is dropped (a
   * card unconfirmed, so nothing was saved), the conversation goes back to
   * where it was, and the words go into the typing box to fix and send.
   */
  function editSpoken() {
    if (!spokenTurn || saving || screen.kind === "saved") return;
    abort.current?.abort();
    if (screen.kind === "card") reportKakakOutcome(screen.requestId, "cancelled");
    setScreen(spokenTurn.screen);
    setHistory(spokenTurn.history);
    setSaid(spokenTurn.said);
    setDraft(spokenTurn.words);
    setTypingAnswer(spokenTurn.typingAnswer || spokenTurn.screen.kind === "question" || spokenTurn.screen.kind === "card");
    setSpokenTurn(null);
  }

  function restart() {
    abort.current?.abort();
    setSpokenTurn(null);
    lastTurn.current = null;
    setHistory(null);
    setSaid([]);
    setDraft("");
    setTypingAnswer(false);
    setScreen({ kind: "typing" });
  }

  async function ask(words: string, from: KakakHistory | null) {
    lastTurn.current = { words, history: from };
    setScreen({ kind: "waiting" });
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    let reply: KakakReply;
    try {
      reply = await askKakak(activeHouseholdId, from, words, locale, controller.signal);
    } catch {
      return; // the sheet was closed
    }
    // Edit took the words back, or a newer turn started: this answer is stale.
    if (controller.signal.aborted) return;
    show(reply);
  }

  function show(reply: KakakReply) {
    if ("practice" in reply && reply.practice) setPractice(true);
    switch (reply.kind) {
      case "question":
        setHistory(reply.history);
        setScreen({
          kind: "question",
          question: reply.question,
          answers: reply.answers,
          allowTyping: reply.allowTyping,
          ...(reply.foodRules ? { foodRules: true } : {}),
        });
        return;
      case "suggestions":
        setHistory(reply.history);
        setScreen({ kind: "card", text: reply.text, items: reply.items, requestId: reply.requestId });
        return;
      case "message":
        setHistory(reply.history);
        setScreen({ kind: "message", text: reply.text || t("Sorry, I didn't catch that.", "Maaf, Kakak belum paham.") });
        return;
      case "refused":
        setScreen({ kind: "message", ...refusal(reply.reason, t) });
        setHistory(null);
        return;
      case "failed":
        setScreen({ kind: "message", ...failure(reply.reason, t) });
        setHistory(null);
        return;
    }
  }

  async function confirm(items: KakakSuggestion[], requestId: string, refined: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      const { undo } = await save(items);
      // Saved: the spoken words can't be edited any more. Putting them back
      // would leave the saved screen (and its Undo) with the routine still
      // saved, and resending could add it twice (Codex, PR #165).
      setSpokenTurn(null);
      // Adjusted with the card's chips: Kakak was close, not right (statistics).
      reportKakakOutcome(requestId, refined ? "changed" : "confirmed");
      // A pet routine ends on Kakak's own "Done", saying what it means for
      // the family, with the routine as the owner will find it (Phase 173 PR B).
      const benefit = savedBenefit(items, locale);
      if (benefit) {
        setScreen({ kind: "saved", text: benefit, items, undo, requestId, refined });
        return;
      }
      toast.success(savedSummary(items, locale), {
        duration: UNDO_TOAST_MS,
        action: {
          label: t("Undo", "Batalkan"),
          onClick: () => {
            // The record takes Undo only after "confirmed" (migrations/126).
            if (!refined) reportKakakOutcome(requestId, "undone");
            // "Undone" only when every part came back (Codex, PR #68).
            void undo().then((allBack) =>
              allBack
                ? toast(t("Undone.", "Dibatalkan."))
                : toast.error(
                    t(
                      "Couldn't undo all of it. Check the list and remove what's left.",
                      "Tidak semua bisa dibatalkan. Cek daftarnya dan hapus yang tersisa."
                    )
                  )
            );
          },
        },
      });
      onClose();
      onSaved?.();
    } catch (error) {
      console.error("Kakak save", error);
      toast.error(t("Something went wrong. Nothing was saved.", "Ada yang salah. Tidak ada yang disimpan."));
    } finally {
      setSaving(false);
    }
  }

  /** Undo from Kakak's "Done": everything this card added comes back out. */
  async function undoSaved() {
    if (screen.kind !== "saved" || saving) return;
    setSaving(true);
    if (!screen.refined) reportKakakOutcome(screen.requestId, "undone");
    const allBack = await screen.undo();
    setSaving(false);
    if (allBack) toast(t("Undone.", "Dibatalkan."));
    else
      toast.error(
        t(
          "Couldn't undo all of it. Check the list and remove what's left.",
          "Tidak semua bisa dibatalkan. Cek daftarnya dan hapus yang tersisa."
        )
      );
    onClose();
  }

  function cancel() {
    if (screen.kind === "card") reportKakakOutcome(screen.requestId, "cancelled");
    onClose();
  }

  /** The typing box is on screen (the same test as where it renders below). */
  const showTyping =
    screen.kind === "typing" ||
    (screen.kind === "message" && (!screen.problem || screen.problem.next === "rephrase")) ||
    ((screen.kind === "question" || screen.kind === "card") && typingAnswer);

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      {practice && (
        <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t(
            "Practice mode: Kakak's answers are scripted and nothing is sent to the AI. Saving still saves.",
            "Mode latihan: jawaban Kakak sudah disiapkan dan tidak ada yang dikirim ke AI. Menyimpan tetap tersimpan."
          )}
        </p>
      )}
      {said.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="kakak-said">
          {said.map((line, index) =>
            line.who === "owner" ? (
              <div key={index} className="flex max-w-[85%] flex-col items-end gap-1 self-end">
                <p
                  ref={index === said.length - 1 ? latestSaid : undefined}
                  className="scroll-mt-2 rounded-2xl rounded-br-md bg-slate-100 px-3 py-2 text-sm text-gray-900"
                >
                  {line.text}
                </p>
                {/* Sent by Done, so the owner never saw it in the box: one tap
                    puts it back there to fix a misheard word. */}
                {line.spoken && index === said.length - 1 && spokenTurn && (
                  <button
                    type="button"
                    onClick={editSpoken}
                    disabled={saving}
                    className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground active:bg-muted disabled:opacity-50"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    {t("Edit words", "Ubah kata-kata")}
                  </button>
                )}
              </div>
            ) : (
              // Her earlier lines: the same bubble, a little quieter than her latest.
              <div key={index} className="opacity-80" data-testid="kakak-earlier">
                <KakakBubble>{line.text}</KakakBubble>
              </div>
            )
          )}
        </div>
      )}

      {screen.kind === "waiting" && <KakakThinking />}

      {screen.kind === "question" && screen.foodRules && (
        <FoodRulesQuestion
          question={screen.question}
          allowTyping={screen.allowTyping && !typingAnswer}
          onType={() => setTypingAnswer(true)}
          onAnswer={(reply) => void send(reply)}
        />
      )}

      {screen.kind === "question" && !screen.foodRules && (
        <div className="flex flex-col gap-3">
          <KakakBubble>{screen.question}</KakakBubble>
          <div className="grid grid-cols-2 gap-2">
            {screen.answers.map((answer) => (
              <Button
                key={answer}
                type="button"
                variant="outline"
                className="min-h-12 rounded-xl text-sm"
                onClick={() => void send(answer)}
              >
                {answer}
              </Button>
            ))}
          </div>
          {screen.allowTyping && !typingAnswer && (
            <button
              type="button"
              className="self-start text-sm font-medium text-muted-foreground underline-offset-4 active:underline"
              onClick={() => setTypingAnswer(true)}
            >
              {t("Or type an answer", "Atau ketik jawaban")}
            </button>
          )}
        </div>
      )}

      {screen.kind === "card" && (
        <RoomAwareSuggestionCard
          text={screen.text}
          items={screen.items}
          saving={saving}
          onDrop={(index) =>
            setScreen({ ...screen, items: screen.items.filter((_, i) => i !== index) })
          }
          onRefine={(index, change) =>
            setScreen({
              ...screen,
              refined: true,
              items: screen.items.map((item, i) => (i === index && item.kind === "chore" ? refineChore(item, change) : item)),
            })
          }
          onRefineRoutine={(index, change) =>
            setScreen({
              ...screen,
              refined: true,
              items: screen.items.map((item, i) =>
                i === index && item.kind === "pet_routine" ? refinePetRoutine(item, change) : item
              ),
            })
          }
          onConfirm={() => void confirm(screen.items.filter(addsSomething), screen.requestId, Boolean(screen.refined))}
          onChange={() => {
            reportKakakOutcome(screen.requestId, "changed");
            setTypingAnswer(true);
          }}
          onCancel={cancel}
          changing={typingAnswer}
        />
      )}

      {screen.kind === "saved" && (
        <SavedRoutine text={screen.text} items={screen.items} busy={saving} onDone={onClose} onUndo={() => void undoSaved()} />
      )}

      {screen.kind === "message" &&
        (screen.problem ? (
          <ProblemBubble icon={screen.problem.icon}>{screen.text}</ProblemBubble>
        ) : (
          <KakakBubble>{screen.text}</KakakBubble>
        ))}

      {screen.kind === "message" && screen.problem?.next === "retry" && (
        <Button type="button" className="min-h-12 rounded-xl text-base" onClick={retry}>
          <RotateCcw className="size-4" aria-hidden="true" />
          {t("Try again", "Coba lagi")}
        </Button>
      )}
      {screen.kind === "message" && screen.problem?.next === "restart" && (
        <Button type="button" className="min-h-12 rounded-xl text-base" onClick={restart}>
          <RotateCcw className="size-4" aria-hidden="true" />
          {t("Start again", "Mulai lagi")}
        </Button>
      )}

      {/* Can we cook it? (20 Nov): the newest card first, under the one-a-week rule. */}
      {screen.kind === "typing" && said.length === 0 && <WhatsNewCard id="kakak-ideas-2026-11" />}
      {screen.kind === "typing" && said.length === 0 && <WhatsNewCard id="kakak-cook-2026-11" />}
      {/* Kakak's card, short by default (19 Nov), under the one-a-week rule. */}
      {screen.kind === "typing" && said.length === 0 && <WhatsNewCard id="kakak-short-card-2026-11" />}
      {/* Kakak's new look (the warm seal, 20 Nov): after the short card, in its own week. */}
      {screen.kind === "typing" && said.length === 0 && <WhatsNewCard id="kakak-warm-seal-2026-11" />}
      {/* Kakak's pet routines (Phase 173 PR B): once, before the first try, under the one-a-week rule. */}
      {screen.kind === "typing" && said.length === 0 && <WhatsNewCard id="kakak-routines-2026-11" />}
      {/* Kakak answers questions, and adds an ingredient (2026-11-14): the same, in its own week. */}
      {screen.kind === "typing" && said.length === 0 && <WhatsNewCard id="kakak-answers-2026-11" />}

      {/* Talk to Kakak: spoken words go through send() like typed ones. */}
      {newVoice ? (
        // Tap to talk, tap to end (owner, 20 Nov). Done sends straight away,
        // with anything already typed in front; Edit words under the line puts it
        // back. Ended any other way (the limit, the browser), nothing is
        // sent: the words wait in the typing box. Either way Kakak only
        // prepares a card; nothing is saved before its confirm tap.
        <KakakVoiceNew
          screen={screen}
          onSpeaking={setSpeaking}
          listenHere={showTyping || screen.kind === "question"}
          onSpoken={(text, by) => {
            const words = (draft.trim() ? `${draft.trim()} ${text}` : text).slice(0, MAX_TYPED);
            if (by === "owner") {
              void send(words, { spoken: true });
              return;
            }
            setDraft(words);
            // Kakak's question has no typing box until asked for: open it.
            if (screen.kind === "question" || screen.kind === "card") setTypingAnswer(true);
          }}
        />
      ) : (
        <KakakVoice
          screen={screen}
          onSpeaking={setSpeaking}
          listenHere={showTyping || screen.kind === "question"}
          inputShown={showTyping}
          onHeard={setDraft}
          onSpoken={(text) => void send(text)}
        />
      )}

      {(screen.kind === "typing" ||
        (screen.kind === "message" && (!screen.problem || screen.problem.next === "rephrase")) ||
        ((screen.kind === "question" || screen.kind === "card") && typingAnswer)) && (
        <TypingBox
          draft={draft}
          setDraft={setDraft}
          onSend={(text) => void send(text)}
          placeholder={
            screen.kind === "card"
              ? t("What should change?", "Apa yang perlu diubah?")
              : screen.kind === "question"
                ? t("Type your answer", "Ketik jawaban Anda")
                : screen.kind === "message" && !screen.problem
                  ? // After her answer, the conversation goes on (2026-11-14).
                    t("Anything else?", "Ada lagi?")
                  : t("What should I set up?", "Mau Kakak atur apa?")
          }
          showExamples={screen.kind === "typing" && said.length === 0}
        />
      )}

      {screen.kind === "message" && (
        <Button type="button" variant="ghost" className="self-center rounded-xl" onClick={onClose}>
          {t("Close", "Tutup")}
        </Button>
      )}
    </div>
  );
}

/** One line of the conversation so far. */
interface SaidLine {
  who: "owner" | "kakak";
  text: string;
  /** The owner's line came from the mic's Done, not the typing box. */
  spoken?: boolean;
}

/** A spoken line sent by Done, and the conversation as it was before it, for Edit. */
interface SpokenTurn {
  words: string;
  screen: Screen;
  history: KakakHistory | null;
  said: SaidLine[];
  typingAnswer: boolean;
}

/**
 * What Kakak was saying on this screen, to keep above the owner's answer:
 * her question, her reply, or her line over a card (the card itself goes
 * when it is changed). Nothing for a problem (no internet, a limit), which
 * isn't part of the conversation.
 */
function kakakLine(screen: Screen, cardIntro: string): string | null {
  switch (screen.kind) {
    case "question":
      return screen.question;
    case "message":
      return screen.problem ? null : screen.text;
    case "card":
      return screen.text || cardIntro;
    default:
      return null;
  }
}

/**
 * Her replies on her own blush with its hairline (the warm seal, 20 Nov), so
 * her warmth reaches her words; the owner's lines and the cards stay as they are.
 */
const KAKAK_BUBBLE = "max-w-[85%] rounded-2xl rounded-tl-md border border-kakak-line bg-kakak-tint px-3 py-2 text-sm text-gray-900";

function KakakBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <KakakAvatar className="size-7" />
      <p className={KAKAK_BUBBLE}>{children}</p>
    </div>
  );
}

/**
 * The household's food rules (PR C2, D2): the app's own question, the same
 * for every household. Halal · Halal, no alcohol · No rules · More (the four
 * chips, any number, then Save). Remember for next time is on by default:
 * the tap is the consent and saves it (migrations/176), with Undo; off,
 * nothing is saved and Kakak follows the answer for this conversation only.
 * Either way the answer then goes to Kakak as the owner's reply.
 */
function FoodRulesQuestion({
  question,
  allowTyping,
  onType,
  onAnswer,
}: {
  question: string;
  allowTyping: boolean;
  onType: () => void;
  onAnswer: (reply: string) => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const [remember, setRemember] = useState(true);
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<FoodRule[]>([]);
  const [busy, setBusy] = useState(false);

  async function answer(rules: FoodRule[]) {
    if (busy) return;
    setBusy(true);
    let saved = false;
    if (remember) {
      try {
        const before = await saveFoodPreferences(rules);
        saved = true;
        toast.success(t("Saved. Change it in Kitchen notes.", "Tersimpan. Ubah di Catatan dapur."), {
          duration: UNDO_TOAST_MS,
          action: {
            label: t("Undo", "Batalkan"),
            onClick: () => {
              void saveFoodPreferences(before).then(
                () => toast(t("Undone.", "Dibatalkan.")),
                () => toast.error(t("Couldn't undo. Change it in Kitchen notes.", "Belum bisa dibatalkan. Ubah di Catatan dapur."))
              );
            },
          },
        });
      } catch (err) {
        console.error("Food preferences", err);
        toast.error(
          t(
            "Couldn't save the food rules. Kakak will follow them in this conversation.",
            "Aturan makanan belum tersimpan. Kakak tetap mengikutinya di percakapan ini."
          )
        );
      }
    }
    onAnswer(foodRulesReply(rules, saved, locale));
  }

  return (
    <div className="flex flex-col gap-3" data-testid="kakak-food-rules">
      <KakakBubble>{question}</KakakBubble>
      {more ? (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3">
          <FoodRulesChips
            value={picked}
            locale={locale}
            disabled={busy}
            onChange={setPicked}
            label={t("Food preferences", "Preferensi makanan")}
          />
          <Button type="button" className="min-h-12 rounded-xl text-base" disabled={busy} onClick={() => void answer(picked)}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {t("Save", "Simpan")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {FOOD_RULES_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              variant="outline"
              className="min-h-12 rounded-xl text-sm"
              disabled={busy}
              onClick={() => void answer(preset.rules)}
            >
              {preset[locale]}
            </Button>
          ))}
          <Button type="button" variant="outline" className="min-h-12 rounded-xl text-sm" disabled={busy} onClick={() => setMore(true)}>
            {t("More", "Lainnya")}
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
        <span className="text-sm text-gray-900">{t("Remember for next time", "Ingat untuk berikutnya")}</span>
        <Switch
          on={remember}
          label={t("Remember for next time", "Ingat untuk berikutnya")}
          disabled={busy}
          onToggle={() => setRemember((on) => !on)}
        />
      </div>
      {allowTyping && (
        <button
          type="button"
          className="self-start text-sm font-medium text-muted-foreground underline-offset-4 active:underline"
          onClick={onType}
        >
          {t("Or type an answer", "Atau ketik jawaban")}
        </button>
      )}
    </div>
  );
}

/** Kakak couldn't answer: the same bubble, with a quiet icon saying why. Calm, not red. */
function ProblemBubble({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2" role="alert">
      <KakakAvatar className="size-7" />
      <div className={cn("flex items-start gap-2", KAKAK_BUBBLE)}>
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p>{children}</p>
      </div>
    </div>
  );
}

function TypingBox({
  draft,
  setDraft,
  onSend,
  placeholder,
  showExamples,
}: {
  draft: string;
  setDraft: (value: string) => void;
  onSend: (text: string) => void;
  placeholder: string;
  showExamples: boolean;
}) {
  const t = useT();
  const box = useRef<HTMLTextAreaElement>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSend(draft);
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <Textarea
          ref={box}
          autoFocus
          value={draft}
          maxLength={MAX_TYPED}
          rows={2}
          enterKeyHint="send"
          aria-label={placeholder}
          placeholder={placeholder}
          className="min-h-[52px] flex-1 resize-none rounded-xl text-base"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSend(draft);
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          className="size-12 shrink-0 rounded-xl"
          disabled={!draft.trim()}
          aria-label={t("Send", "Kirim")}
        >
          <Send className="size-5" />
        </Button>
      </div>
      {showExamples && (
        <KakakExamples
          onPick={(example) => {
            setDraft(example);
            box.current?.focus();
          }}
        />
      )}
    </form>
  );
}

type SuggestionCardProps = Omit<Parameters<typeof SuggestionCard>[0], "locations" | "details" | "onDetails">;

/**
 * The card with the household's rooms, read under Suspense: while they load
 * (the first time only), the same card shows every room. Whether Change is
 * open lives here, above the Suspense, so it stays open when they arrive.
 */
function RoomAwareSuggestionCard(props: SuggestionCardProps) {
  const [details, setDetails] = useState(false);
  const shared = { ...props, details, onDetails: setDetails };
  return (
    <Suspense fallback={<SuggestionCard {...shared} locations={null} />}>
      <WithRooms {...shared} />
    </Suspense>
  );
}

function WithRooms(props: Omit<Parameters<typeof SuggestionCard>[0], "locations">) {
  const { locations } = useHouseholdLocations();
  return <SuggestionCard {...props} locations={locations} />;
}

function SuggestionCard({
  text,
  items,
  locations,
  details,
  onDetails,
  saving,
  changing,
  onDrop,
  onRefine,
  onRefineRoutine,
  onConfirm,
  onChange,
  onCancel,
}: {
  text: string;
  items: KakakSuggestion[];
  locations: readonly HouseholdLocation[] | null;
  /** Change is open: the chips and the rest of the card. */
  details: boolean;
  onDetails: (open: boolean) => void;
  saving: boolean;
  changing: boolean;
  onDrop: (index: number) => void;
  onRefine: (index: number, change: ChoreRefinement) => void;
  onRefineRoutine: (index: number, change: PetRoutineRefinement) => void;
  onConfirm: () => void;
  onChange: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const saveable = items.filter(addsSomething).length;
  /**
   * Short by default (19 Nov, product change #1): a chore shows What, Who
   * and When, and Looks right stays in reach. Change opens the rest here —
   * the chips and the card's other rows — with no call to Kakak; a change
   * the chips can't say is still typed to her from there.
   */
  const hasChore = items.some((item) => item.kind === "chore");
  // Leaves out a room the task's name already says (lib/room-in-name.ts).
  const saysRoom = (item: ChoreSuggestion) => nameSaysPlace([item.title, item.titleEn], item.locationId, null, locations);
  const open = hasChore && details && !changing;
  return (
    <div className="flex flex-col gap-3">
      <KakakBubble>{text || t("Here's what I'll add:", "Ini yang akan Kakak tambahkan:")}</KakakBubble>
      <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-sm" id="kakak-card">
        {items.map((item, index) => {
          // A staff-areas card's "nobody would see" counts every card on screen (Codex, PR #140).
          const card = describeSuggestion(item, locale, item.kind === "staff_areas" ? staffAreasNobody(items, index) : undefined);
          // A chore at a glance; the rest of it under Change, or while a change is typed to Kakak.
          const glance = item.kind === "chore" ? choreGlance(item, locale, saysRoom(item)) : null;
          const rows = glance ? [...glance.rows, ...(open || changing ? glance.more : [])] : card.rows;
          // A routine shows its own icon (Lights off, Walk…), as on the Pets tab.
          const Icon =
            (item.kind === "pet_routine" ? routineKindInfo(item.routine as RoutineKind)?.icon : undefined) ?? KIND_ICONS[item.kind];
          return (
            <div key={index} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Icon className="size-3.5" aria-hidden="true" />
                  {card.heading}
                </p>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDrop(index)}
                    aria-label={t("Remove", "Hapus")}
                    className="-mr-2 flex size-9 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
                {rows.map((row, r) => {
                  // The card assembles itself, one row after another (motion-reduce: at once).
                  const motion = { className: "animate-kakak-row motion-reduce:animate-none", style: { animationDelay: `${r * 90}ms` } };
                  // Values larger and heavier than their labels; a chore's name is the card's headline.
                  const value = glance && r === 0 ? "text-headline" : "text-base font-semibold leading-snug";
                  return (
                    <div key={r} className="contents">
                      <dt className={cn("text-sm text-muted-foreground", motion.className)} style={motion.style}>
                        {row.label}
                      </dt>
                      {row.toggle ? (
                        <dd className={cn("flex min-h-9 items-center justify-between gap-2", motion.className)} style={motion.style}>
                          <span className={cn(value, row.toggle.on ? "text-gray-900" : "text-muted-foreground")}>
                            {row.value}
                          </span>
                          <Switch
                            on={row.toggle.on}
                            label={row.label}
                            disabled={saving || changing || !row.toggle.allowed}
                            onToggle={() => {
                              const toggle = row.toggle!;
                              onRefineRoutine(
                                index,
                                toggle.field === "remindStaff" ? { remindStaff: !toggle.on } : { alertOwners: !toggle.on }
                              );
                            }}
                          />
                        </dd>
                      ) : (
                        <dd className={cn("text-gray-900", row.guess && "text-amber-700", motion.className)} style={motion.style}>
                          {/* Its own span: cn() reads text-headline as a colour and would drop it beside one. */}
                          <span className={value}>{row.value}</span>
                        </dd>
                      )}
                    </div>
                  );
                })}
              </dl>
              {/* The app's own answer (Fable S0): it stays when her sentence is dropped. */}
              {card.checks?.map((check, c) => (
                <p
                  key={c}
                  data-kakak-check={check.tone}
                  className={cn(
                    "flex items-start gap-1.5 text-sm font-medium",
                    check.tone === "ready" ? "text-emerald-700" : check.tone === "missing" ? "text-amber-700" : "text-muted-foreground"
                  )}
                >
                  {check.tone === "ready" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                  ) : check.tone === "muted" ? (
                    <CircleHelp className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <ShoppingBasket className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                  )}
                  <span>{check.text}</span>
                </p>
              ))}
              {card.note && <p className="text-xs text-muted-foreground">{card.note}</p>}
              {item.kind === "chore" && open && (
                <>
                  <ChoreChips item={item} disabled={saving} onRefine={(change) => onRefine(index, change)} />
                  <KakakRemindChips
                    value={item.remindDaysBefore ?? null}
                    disabled={saving}
                    onChange={(days) => onRefine(index, { remindDaysBefore: days })}
                  />
                </>
              )}
            </div>
          );
        })}
        {open && (
          <button
            type="button"
            disabled={saving}
            onClick={onChange}
            className="flex min-h-12 items-center gap-2 px-4 text-left text-sm font-medium text-gray-900 active:bg-muted disabled:opacity-50"
          >
            <MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("Or tell Kakak what to change", "Atau bilang ke Kakak apa yang diubah")}
          </button>
        )}
      </div>
      {!changing && (
        <>
          <Button
            type="button"
            className="min-h-12 rounded-xl text-base"
            disabled={saving || saveable === 0}
            onClick={onConfirm}
          >
            {saving ? (
              <Loader2 className="size-5 animate-spin" aria-label={t("Saving", "Menyimpan")} />
            ) : (
              <>
                <Check className="size-5" aria-hidden="true" />
                {saveable > 1
                  ? t(`Save ${saveable}`, `Simpan ${saveable}`)
                  : items.some((item) => item.kind === "pet_routine" || item.kind === "staff_areas")
                    ? t("Save", "Simpan")
                    : t("Looks right", "Sudah benar")}
              </>
            )}
          </Button>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={saving}
              // With a chore, Change opens the rest of the card here; otherwise it goes to Kakak, as before.
              onClick={hasChore ? () => onDetails(!details) : onChange}
              aria-expanded={hasChore ? details : undefined}
              aria-controls={hasChore ? "kakak-card" : undefined}
              className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-gray-900 active:bg-muted disabled:opacity-50"
            >
              {t("Change", "Ubah")}
              {hasChore && (
                <ChevronDown className={cn("size-4 transition-transform", details && "rotate-180")} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onCancel}
              className="min-h-11 rounded-lg px-2 text-sm font-medium text-muted-foreground active:bg-muted disabled:opacity-50"
            >
              {t("Cancel", "Batal")}
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {t("You can undo it straight after saving.", "Setelah disimpan, masih bisa dibatalkan.")}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * One-tap refinements under a chore (lib/kakak/refine.ts): how often, and
 * for whom. They change the card on the phone, with no call to the AI; a
 * change the chips can't say goes through Change instead.
 */
function ChoreChips({
  item,
  disabled,
  onRefine,
}: {
  item: ChoreSuggestion;
  disabled: boolean;
  onRefine: (change: ChoreRefinement) => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  return (
    <div className="mt-2 flex flex-col gap-2 border-t pt-3">
      <ChipRow label={t("How often", "Seberapa sering")}>
        {REPEAT_CHOICES.map((choice) => (
          <Chip
            key={choice}
            on={item.recurrence === choice}
            disabled={disabled}
            onClick={() => onRefine({ recurrence: choice })}
          >
            {repeatLabel(choice, item.dueDate, locale)}
          </Chip>
        ))}
      </ChipRow>
      {/* The roster loads on demand; until then, only "Anyone". */}
      <Suspense fallback={<WhoChips item={item} people={[]} disabled={disabled} onRefine={onRefine} />}>
        <RosterWhoChips item={item} disabled={disabled} onRefine={onRefine} />
      </Suspense>
    </div>
  );
}

/** At most four people, so the row stays short: the one Kakak picked first. */
const MAX_WHO_CHIPS = 4;

function RosterWhoChips(props: { item: ChoreSuggestion; disabled: boolean; onRefine: (change: ChoreRefinement) => void }) {
  const { profiles } = useStaffProfiles();
  const staff = (profiles ?? []).filter((p) => !p.user_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const picked = staff.find((p) => p.id === props.item.assignedTo);
  const people = [...(picked ? [picked] : []), ...staff.filter((p) => p !== picked)]
    .slice(0, MAX_WHO_CHIPS)
    .map((p) => ({ id: p.id, name: firstName(p.name) }));
  return <WhoChips {...props} people={people} />;
}

function WhoChips({
  item,
  people,
  disabled,
  onRefine,
}: {
  item: ChoreSuggestion;
  people: { id: string; name: string }[];
  disabled: boolean;
  onRefine: (change: ChoreRefinement) => void;
}) {
  const t = useT();
  return (
    <ChipRow label={t("Who", "Siapa")}>
      {people.map((person) => (
        <Chip
          key={person.id}
          on={item.assignedTo === person.id}
          disabled={disabled}
          onClick={() => onRefine({ assignee: person })}
        >
          {person.name}
        </Chip>
      ))}
      <Chip
        on={item.assignedTo === null && !item.assignToSelf}
        disabled={disabled}
        onClick={() => onRefine({ assignee: null })}
      >
        {t("Anyone", "Siapa saja")}
      </Chip>
    </ChipRow>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** The food form's choice chip, a little smaller for the card. */
function Chip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 text-sm disabled:opacity-50",
        on ? "border-primary bg-primary text-primary-foreground" : "text-gray-700 active:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Kakak's "Done" after a pet routine is saved (Phase 173 PR B): the benefit
 * in her words, then the routine as it now sits in the pet's routines, then
 * Done, with Undo beside it. The mark settles in once (motion-reduce: still).
 */
function SavedRoutine({
  text,
  items,
  busy,
  onDone,
  onUndo,
}: {
  text: string;
  items: KakakSuggestion[];
  busy: boolean;
  onDone: () => void;
  onUndo: () => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const lines = items
    .map((item) => ({ item, line: routineListLine(item, locale) }))
    .filter((x): x is { item: Extract<KakakSuggestion, { kind: "pet_routine" }>; line: { title: string; detail: string } } => x.line !== null);
  return (
    <div className="flex flex-col gap-3" data-testid="kakak-saved">
      <div className="flex justify-center py-1">
        <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 animate-kakak-done motion-reduce:animate-none">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
      </div>
      <div role="status">
        <KakakBubble>{text}</KakakBubble>
      </div>
      <div
        className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3 shadow-sm animate-kakak-row motion-reduce:animate-none"
        style={{ animationDelay: "240ms" }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("In your routines", "Di rutinitas Anda")}
        </p>
        {lines.map(({ item, line }, index) => {
          const Icon = routineKindInfo(item.routine as RoutineKind)?.icon ?? PawPrint;
          return (
            <div key={index} className="flex min-h-11 items-center gap-3">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-gray-900">{line.title}</span>
                <span className="text-xs text-muted-foreground">{line.detail}</span>
              </span>
            </div>
          );
        })}
      </div>
      <Button type="button" className="min-h-12 rounded-xl text-base" disabled={busy} onClick={onDone}>
        {t("Done", "Selesai")}
      </Button>
      <Button type="button" variant="ghost" className="min-h-11 rounded-xl" disabled={busy} onClick={onUndo}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Undo2 className="size-4" aria-hidden="true" />}
        {t("Undo", "Batalkan")}
      </Button>
    </div>
  );
}

const KIND_ICONS: Record<KakakSuggestion["kind"], LucideIcon> = {
  chore: ListChecks,
  shopping: ShoppingCart,
  pet_routine: PawPrint,
  food: Refrigerator,
  ingredient: Carrot,
  new_ingredient: Carrot,
  staff_areas: Eye,
  menu_dish: CookingPot,
  recipe_idea: Lightbulb,
};

type T = (en: string, id: string) => string;

function refusal(reason: RefusalReason | "unavailable", t: T): { text: string; problem: Problem } {
  switch (reason) {
    case "limit":
      return {
        text: t(
          "Kakak has helped a lot today — try again tomorrow, or add it yourself.",
          "Kakak sudah banyak membantu hari ini — coba lagi besok, atau tambahkan sendiri."
        ),
        problem: { icon: Gauge, next: "none" },
      };
    case "busy":
      return {
        text: t(
          "Kakak is busy right now — try again in a minute, or add it yourself.",
          "Kakak sedang sibuk — coba lagi sebentar lagi, atau tambahkan sendiri."
        ),
        problem: { icon: Hourglass, next: "retry" },
      };
    case "off":
    case "not_allowed":
      return {
        text: t("Kakak is turned off for this home.", "Kakak sedang dimatikan untuk rumah ini."),
        problem: { icon: CircleAlert, next: "none" },
      };
    case "unavailable":
      return {
        text: t(
          "Kakak isn't available right now. You can still add everything yourself.",
          "Kakak sedang tidak tersedia. Anda tetap bisa menambahkan semuanya sendiri."
        ),
        problem: { icon: CircleAlert, next: "none" },
      };
    default:
      return {
        text: t("Only an admin of this home can use Kakak.", "Hanya admin rumah ini yang bisa memakai Kakak."),
        problem: { icon: CircleAlert, next: "none" },
      };
  }
}

function failure(reason: KakakFailure, t: T): { text: string; problem: Problem } {
  switch (reason) {
    case "offline":
      return {
        text: t("Kakak needs the internet. Check your connection and try again.", "Kakak perlu internet. Cek internet Anda lalu coba lagi."),
        problem: { icon: WifiOff, next: "retry" },
      };
    case "slow":
      return {
        text: t("Kakak took too long. Nothing was saved — try again.", "Kakak terlalu lama menjawab. Tidak ada yang disimpan — coba lagi."),
        problem: { icon: Hourglass, next: "retry" },
      };
    case "cap":
      return {
        text: t(
          "Kakak has reached this month's limit. You can still add everything yourself.",
          "Kakak sudah mencapai batas bulan ini. Anda tetap bisa menambahkan semuanya sendiri."
        ),
        problem: { icon: Gauge, next: "none" },
      };
    case "stale":
      return {
        text: t("This conversation is from earlier. Start again to tell Kakak.", "Percakapan ini sudah lewat. Mulai lagi untuk bilang ke Kakak."),
        problem: { icon: RotateCcw, next: "restart" },
      };
    case "too_long":
      // The conversation holds as many turns as it may: saying it another
      // way would only be refused again, so the way on is to start again.
      return {
        text: t(
          "We've covered a lot in this conversation. Start again, and tell me what's next.",
          "Percakapan ini sudah panjang. Mulai lagi, lalu bilang ke Kakak apa berikutnya."
        ),
        problem: { icon: RotateCcw, next: "restart" },
      };
    case "invalid":
    case "refusal":
      return {
        text: t(
          "Kakak couldn't work that out — try saying it another way, or add it yourself.",
          "Kakak belum bisa mengaturnya — coba dengan kata lain, atau tambahkan sendiri."
        ),
        problem: { icon: CircleAlert, next: "rephrase" },
      };
    default:
      return {
        text: t("Something went wrong. Nothing was saved.", "Ada yang salah. Tidak ada yang disimpan."),
        problem: { icon: CircleAlert, next: "retry" },
      };
  }
}
