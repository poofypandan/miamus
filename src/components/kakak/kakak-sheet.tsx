"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Check,
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
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { KakakAvatar } from "@/components/kakak/kakak-avatar";
import { KakakExamples } from "@/components/kakak/kakak-examples";
import { KakakThinking } from "@/components/kakak/kakak-thinking";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { askKakak, reportKakakOutcome, type KakakFailure, type KakakReply } from "@/lib/kakak/client";
import { addsSomething, describeSuggestion, savedSummary } from "@/lib/kakak/describe";
import { MAX_TYPED, type KakakHistory, type RefusalReason } from "@/lib/kakak/engine";
import type { KakakSuggestion } from "@/lib/kakak/suggestions";
import { useKakakSave } from "@/lib/kakak/use-kakak-save";
import { firstName } from "@/lib/kakak/context";
import { REPEAT_CHOICES, refineChore, refinementNote, repeatLabel, type ChoreRefinement } from "@/lib/kakak/refine";
import type { ChoreSuggestion } from "@/lib/kakak/suggestions";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { cn } from "@/lib/utils";

type Screen =
  | { kind: "typing" }
  | { kind: "waiting" }
  | { kind: "question"; question: string; answers: string[]; allowTyping: boolean }
  /** `refined`: the owner adjusted the card with its chips before saving. */
  | { kind: "card"; text: string; items: KakakSuggestion[]; requestId: string; refined?: boolean }
  | { kind: "message"; text: string; problem?: Problem };

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
  /** What the owner wrote, kept on screen so they see what Kakak read. */
  const [said, setSaid] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [typingAnswer, setTypingAnswer] = useState(false);
  const [saving, setSaving] = useState(false);
  /** The server answered in practice mode (scripted, no AI): say so. */
  const [practice, setPractice] = useState(false);
  const abort = useRef<AbortController | null>(null);
  /** The last words sent and the history they went with, for "Try again". */
  const lastTurn = useRef<{ words: string; history: KakakHistory | null } | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

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
    setSaid((list) => [...list, own]);
    setDraft("");
    setTypingAnswer(false);
    await ask(words, history);
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

  function cancel() {
    if (screen.kind === "card") reportKakakOutcome(screen.requestId, "cancelled");
    onClose();
  }

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
        <div className="flex flex-col items-end gap-2">
          {said.map((line, index) => (
            <p key={index} className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-100 px-3 py-2 text-sm text-gray-900">
              {line}
            </p>
          ))}
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
          onConfirm={() => void confirm(screen.items.filter(addsSomething), screen.requestId, Boolean(screen.refined))}
          onChange={() => {
            reportKakakOutcome(screen.requestId, "changed");
            setTypingAnswer(true);
          }}
          onCancel={cancel}
          changing={typingAnswer}
        />
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
          const Icon = KIND_ICONS[item.kind];
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
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {card.rows.map((row, r) => (
                  <div key={r} className="contents">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className={cn("font-medium text-gray-900", row.guess && "text-amber-700")}>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {card.note && <p className="text-xs text-muted-foreground">{card.note}</p>}
              {item.kind === "chore" && !changing && (
                <ChoreChips item={item} disabled={saving} onRefine={(change) => onRefine(index, change)} />
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
                {saveable > 1 ? t(`Save ${saveable}`, `Simpan ${saveable}`) : t("Looks right", "Sudah benar")}
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

const KIND_ICONS: Record<KakakSuggestion["kind"], LucideIcon> = {
  chore: ListChecks,
  shopping: ShoppingCart,
  pet_routine: PawPrint,
  food: Refrigerator,
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
        text: t("Kakak is turned off for this household.", "Kakak sedang dimatikan untuk rumah ini."),
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
        text: t("Only an admin of this household can use Kakak.", "Hanya admin rumah ini yang bisa memakai Kakak."),
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
    case "invalid":
    case "too_long":
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
