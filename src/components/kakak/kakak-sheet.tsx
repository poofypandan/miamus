"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { KakakAvatar } from "@/components/kakak/kakak-avatar";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { askKakak, reportKakakOutcome, type KakakReply } from "@/lib/kakak/client";
import { addsSomething, describeSuggestion, savedSummary } from "@/lib/kakak/describe";
import { MAX_TYPED, type KakakHistory } from "@/lib/kakak/engine";
import type { KakakSuggestion } from "@/lib/kakak/suggestions";
import { useKakakSave } from "@/lib/kakak/use-kakak-save";
import { cn } from "@/lib/utils";

type Screen =
  | { kind: "typing" }
  | { kind: "waiting" }
  | { kind: "question"; question: string; answers: string[]; allowTyping: boolean }
  | { kind: "card"; text: string; items: KakakSuggestion[]; requestId: string }
  | { kind: "message"; text: string };

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

  useEffect(() => () => abort.current?.abort(), []);

  const examples =
    locale === "id"
      ? ["Mbak Sari pel teras tiap Senin jam 9", "Beli telur dan gula 2 kg", "Mochi makan jam 7 dan jam 5 sore"]
      : ["Sari mops the terrace every Monday at 9", "Buy eggs and 2 kg of sugar", "Feed Mochi at 7 and 5 pm"];

  async function send(text: string) {
    const words = text.trim().slice(0, MAX_TYPED);
    if (!words) return;
    setSaid((list) => [...list, words]);
    setDraft("");
    setTypingAnswer(false);
    setScreen({ kind: "waiting" });
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    let reply: KakakReply;
    try {
      reply = await askKakak(activeHouseholdId, history, words, locale, controller.signal);
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
        setScreen({ kind: "message", text: refusalText(reply.reason, t) });
        setHistory(null);
        return;
      case "failed":
        setScreen({ kind: "message", text: failureText(reply.reason, t) });
        setHistory(null);
        return;
    }
  }

  async function confirm(items: KakakSuggestion[], requestId: string) {
    if (saving) return;
    setSaving(true);
    try {
      const { undo } = await save(items);
      reportKakakOutcome(requestId, "confirmed");
      toast.success(savedSummary(items, locale), {
        action: {
          label: t("Undo", "Batalkan"),
          onClick: () => {
            reportKakakOutcome(requestId, "undone");
            void undo();
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

      {screen.kind === "waiting" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <span className="flex gap-1" aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="size-1.5 animate-bounce rounded-full bg-slate-400"
                style={{ animationDelay: `${dot * 150}ms` }}
              />
            ))}
          </span>
          {t("One moment…", "Sebentar…")}
        </div>
      )}

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
          onConfirm={() => void confirm(screen.items.filter(addsSomething), screen.requestId)}
          onChange={() => {
            reportKakakOutcome(screen.requestId, "changed");
            setTypingAnswer(true);
          }}
          onCancel={cancel}
          changing={typingAnswer}
        />
      )}

      {screen.kind === "message" && <KakakBubble>{screen.text}</KakakBubble>}

      {(screen.kind === "typing" ||
        screen.kind === "message" ||
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
          examples={screen.kind === "typing" && said.length === 0 ? examples : []}
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

function TypingBox({
  draft,
  setDraft,
  onSend,
  placeholder,
  examples,
}: {
  draft: string;
  setDraft: (value: string) => void;
  onSend: (text: string) => void;
  placeholder: string;
  examples: string[];
}) {
  const t = useT();
  function submit(event: FormEvent) {
    event.preventDefault();
    onSend(draft);
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <Textarea
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
      {examples.length > 0 && (
        <div className="flex flex-col gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setDraft(example)}
              className="rounded-xl border border-dashed px-3 py-2 text-left text-sm text-muted-foreground active:bg-muted"
            >
              {example}
            </button>
          ))}
        </div>
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
  onConfirm,
  onChange,
  onCancel,
}: {
  text: string;
  items: KakakSuggestion[];
  saving: boolean;
  changing: boolean;
  onDrop: (index: number) => void;
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
      <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        {items.map((item, index) => {
          const card = describeSuggestion(item, locale);
          return (
            <div key={index} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{card.heading}</p>
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
              <Loader2 className="size-5 animate-spin" />
            ) : saveable > 1 ? (
              t(`Save ${saveable}`, `Simpan ${saveable}`)
            ) : (
              t("Looks right", "Sudah benar")
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
        </>
      )}
    </div>
  );
}

function refusalText(reason: string, t: (en: string, id: string) => string): string {
  switch (reason) {
    case "limit":
      return t(
        "Kakak has helped a lot today — try again tomorrow, or add it yourself.",
        "Kakak sudah banyak membantu hari ini — coba lagi besok, atau tambahkan sendiri."
      );
    case "busy":
      return t("Kakak is busy right now — try again later, or add it yourself.", "Kakak sedang sibuk — coba lagi nanti, atau tambahkan sendiri.");
    case "off":
    case "not_allowed":
      return t("Kakak is turned off for this household.", "Kakak sedang dimatikan untuk rumah ini.");
    case "unavailable":
      return t("Kakak isn't available right now. You can add it yourself.", "Kakak sedang tidak tersedia. Anda bisa menambahkannya sendiri.");
    default:
      return t("Only an admin of this household can use Kakak.", "Hanya admin rumah ini yang bisa memakai Kakak.");
  }
}

function failureText(reason: string, t: (en: string, id: string) => string): string {
  switch (reason) {
    case "offline":
      return t("Kakak needs the internet.", "Kakak perlu internet.");
    case "invalid":
    case "too_long":
    case "refusal":
      return t("Kakak couldn't work that out — you can add it yourself.", "Kakak belum bisa mengaturnya — Anda bisa menambahkannya sendiri.");
    default:
      return t("Something went wrong. Nothing was saved.", "Ada yang salah. Tidak ada yang disimpan.");
  }
}
