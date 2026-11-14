"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Carrot,
  Check,
  CheckCircle2,
  CircleAlert,
  Gauge,
  Hourglass,
  ListChecks,
  Loader2,
  PawPrint,
  Refrigerator,
  RotateCcw,
  Send,
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
import { KakakAvatar } from "@/components/kakak/kakak-avatar";
import { KakakExamples } from "@/components/kakak/kakak-examples";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { KakakThinking } from "@/components/kakak/kakak-thinking";
import { KakakVoice } from "@/components/kakak/kakak-voice";
import { KakakRemindChips } from "@/components/kakak/kakak-remind-chips";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { askKakak, historyForNextTurn, reportKakakOutcome, type KakakFailure, type KakakReply } from "@/lib/kakak/client";
import { addsSomething, describeSuggestion, routineListLine, savedBenefit, savedSummary } from "@/lib/kakak/describe";
import { routineKindInfo } from "@/lib/pet-routine-kinds";
import type { RoutineKind } from "@/types/database";
import { MAX_TYPED, type KakakHistory, type RefusalReason } from "@/lib/kakak/engine";
import type { KakakSuggestion } from "@/lib/kakak/suggestions";
import { useKakakSave } from "@/lib/kakak/use-kakak-save";
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
import { cn } from "@/lib/utils";

type Screen =
  | { kind: "typing" }
  | { kind: "waiting" }
  | { kind: "question"; question: string; answers: string[]; allowTyping: boolean }
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
export function KakakSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useBackToClose(open, onClose);
  const t = useT();
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl pb-safe">
        <SheetHeader className="flex-row items-center gap-3 px-4 pb-2 pt-4 text-left">
          <KakakAvatar className="size-10" />
          <div className="min-w-0">
            <SheetTitle className="text-base">Kakak</SheetTitle>
            <SheetDescription className="text-xs">
              {t("Nothing is saved until you confirm.", "Tidak ada yang disimpan sebelum Anda konfirmasi.")}
            </SheetDescription>
          </div>
        </SheetHeader>
        {/* Keyed by open: each opening starts a new conversation. */}
        {open && <Conversation onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function Conversation({ onClose }: { onClose: () => void }) {
  const t = useT();
  const locale = useOwnerLocale();
  const { activeHouseholdId } = useHousehold();
  const save = useKakakSave();
  const [screen, setScreen] = useState<Screen>({ kind: "typing" });
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

  async function send(text: string) {
    const typed = text.trim();
    if (!typed) return;
    // A correction after the card's chips carries what they changed, so
    // Kakak's next card keeps it (Codex, PR #68). The owner's words are
    // never cut for it: the note shrinks to the room left, or is left out.
    // The owner's line shows only what they typed.
    const own = typed.slice(0, MAX_TYPED);
    const note = screen.kind === "card" && screen.refined ? refinementNote(screen.items, MAX_TYPED - own.length - 1) : "";
    const words = note ? `${note} ${own}` : own;
    // Kakak's line the owner is answering stays above their answer.
    const hers = kakakLine(screen, t("Here's what I'll add:", "Ini yang akan Kakak tambahkan:"));
    setSaid((list) => [...list, ...(hers ? [{ who: "kakak" as const, text: hers }] : []), { who: "owner" as const, text: own }]);
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

  function restart() {
    abort.current?.abort();
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
    show(reply);
  }

  function show(reply: KakakReply) {
    if ("practice" in reply && reply.practice) setPractice(true);
    switch (reply.kind) {
      case "question":
        setHistory(reply.history);
        setScreen({ kind: "question", question: reply.question, answers: reply.answers, allowTyping: reply.allowTyping });
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
              <p
                key={index}
                ref={index === said.length - 1 ? latestSaid : undefined}
                className="max-w-[85%] scroll-mt-2 self-end rounded-2xl rounded-br-md bg-slate-100 px-3 py-2 text-sm text-gray-900"
              >
                {line.text}
              </p>
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

      {screen.kind === "question" && (
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
        <SuggestionCard
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

      {/* Kakak's pet routines (Phase 173 PR B): once, before the first try, under the one-a-week rule. */}
      {screen.kind === "typing" && said.length === 0 && <WhatsNewCard id="kakak-routines-2026-11" />}
      {/* Kakak answers questions, and adds an ingredient (2026-11-14): the same, in its own week. */}
      {screen.kind === "typing" && said.length === 0 && <WhatsNewCard id="kakak-answers-2026-11" />}

      {/* Talk to Kakak (voice beta): spoken words go through send() like typed ones. */}
      <KakakVoice
        screen={screen}
        listenHere={showTyping || screen.kind === "question"}
        inputShown={showTyping}
        onHeard={setDraft}
        onSpoken={(text) => void send(text)}
      />

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

function KakakBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <KakakAvatar className="size-7" />
      <p className="max-w-[85%] rounded-2xl rounded-tl-md border bg-card px-3 py-2 text-sm text-gray-900">{children}</p>
    </div>
  );
}

/** Kakak couldn't answer: the same bubble, with a quiet icon saying why. Calm, not red. */
function ProblemBubble({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2" role="alert">
      <KakakAvatar className="size-7" />
      <div className="flex max-w-[85%] items-start gap-2 rounded-2xl rounded-tl-md border bg-card px-3 py-2 text-sm text-gray-900">
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

function SuggestionCard({
  text,
  items,
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
  return (
    <div className="flex flex-col gap-3">
      <KakakBubble>{text || t("Here's what I'll add:", "Ini yang akan Kakak tambahkan:")}</KakakBubble>
      <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
        {items.map((item, index) => {
          const card = describeSuggestion(item, locale);
          // A routine shows its own icon (Lights off, Walk…), as on the Pets tab.
          const Icon =
            (item.kind === "pet_routine" ? routineKindInfo(item.routine as RoutineKind)?.icon : undefined) ?? KIND_ICONS[item.kind];
          return (
            <div key={index} className="flex flex-col gap-1.5 px-4 py-3">
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
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-sm">
                {card.rows.map((row, r) => {
                  // The card assembles itself, one row after another (motion-reduce: at once).
                  const motion = { className: "animate-kakak-row motion-reduce:animate-none", style: { animationDelay: `${r * 90}ms` } };
                  return (
                    <div key={r} className="contents">
                      <dt className={cn("text-muted-foreground", motion.className)} style={motion.style}>
                        {row.label}
                      </dt>
                      {row.toggle ? (
                        <dd className={cn("flex min-h-9 items-center justify-between gap-2", motion.className)} style={motion.style}>
                          <span className={cn("font-medium", row.toggle.on ? "text-gray-900" : "text-muted-foreground")}>
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
                        <dd
                          className={cn("font-medium text-gray-900", row.guess && "text-amber-700", motion.className)}
                          style={motion.style}
                        >
                          {row.value}
                        </dd>
                      )}
                    </div>
                  );
                })}
              </dl>
              {card.note && <p className="text-xs text-muted-foreground">{card.note}</p>}
              {item.kind === "chore" && !changing && (
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
                  : items.some((item) => item.kind === "pet_routine")
                    ? t("Save", "Simpan")
                    : t("Looks right", "Sudah benar")}
              </>
            )}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-11 flex-1 rounded-xl" disabled={saving} onClick={onChange}>
              {t("Change", "Ubah")}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11 flex-1 rounded-xl" disabled={saving} onClick={onCancel}>
              {t("Cancel", "Batal")}
            </Button>
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
