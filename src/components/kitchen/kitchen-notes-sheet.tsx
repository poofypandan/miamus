"use client";

import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { MENU_LIMITS } from "@/lib/menu";
import { saveKitchenNotes } from "@/lib/menu-store";
import type { KitchenNotes } from "@/lib/data/types";
import type { CookReadiness } from "@/lib/menu";

/**
 * Kitchen notes (owners, Phase 170 PR C, D12): one short note for whoever
 * cooks, shown on the Menu, on Menu hari ini and on every dish the cook
 * opens. One note per household, never per person.
 *
 * It may hold health information (an allergy), which UU PDP treats with
 * extra care, so the first save asks once and the server records the
 * owner's OK with who and when (set_kitchen_notes). Blank clears it.
 */
export function KitchenNotesSheet({
  open,
  notes,
  readiness,
  onRetry,
  onClose,
}: {
  open: boolean;
  notes: KitchenNotes | null;
  /**
   * Whether the note was read from the server in this session (Codex, PR
   * #101). The editor opens only then: a note that hasn't loaded is never
   * shown as empty, so Save can't wipe it.
   */
  readiness: CookReadiness;
  onRetry: () => void;
  onClose: () => void;
}) {
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl">
        {open &&
          (readiness === "ready" ? (
            <NotesForm notes={notes} onDone={onClose} />
          ) : (
            <NotesWaiting failed={readiness === "failed"} onRetry={onRetry} />
          ))}
      </SheetContent>
    </Sheet>
  );
}

function NotesWaiting({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col">
      <SheetHeader>
        <SheetTitle className="text-xl">{t("Kitchen notes", "Catatan dapur")}</SheetTitle>
        <SheetDescription className="sr-only">{t("Kitchen notes", "Catatan dapur")}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col items-center gap-3 px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {failed ? (
          <>
            <p className="text-center text-sm text-muted-foreground">
              {t("Couldn't load the kitchen notes.", "Catatan dapur belum bisa dimuat.")}
            </p>
            <Button variant="outline" className="min-h-11 rounded-xl" onClick={onRetry}>
              <RefreshCw /> {t("Try again", "Coba lagi")}
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> {t("Loading…", "Memuat…")}
          </p>
        )}
      </div>
    </div>
  );
}

function NotesForm({ notes, onDone }: { notes: KitchenNotes | null; onDone: () => void }) {
  const t = useT();
  const [text, setText] = useState(notes?.text ?? "");
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const confirmed = !!notes?.confirmedAt;
  const changed = text.trim() !== (notes?.text ?? "");

  // One save at a time, even for two taps in one tick (demo check F-1).
  const inFlight = useRef(false);

  async function save(confirm: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await saveKitchenNotes(text.trim() || null, confirm);
      toast.success(t("Kitchen notes saved", "Catatan dapur disimpan"));
      onDone();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
      inFlight.current = false;
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!changed || saving) return;
    // The first note asks once (D12); clearing or a later edit doesn't.
    if (text.trim() && !confirmed) {
      setAsking(true);
      return;
    }
    void save(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <SheetHeader>
        <SheetTitle className="text-xl">{t("Kitchen notes", "Catatan dapur")}</SheetTitle>
        <SheetDescription>
          {t(
            "For whoever cooks: what the family doesn't eat, how spicy, anything to keep in mind.",
            "Untuk yang memasak: makanan yang tidak dimakan keluarga, tingkat pedas, atau hal lain yang perlu diingat."
          )}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          // Held while the one-time question is up, so what is asked about
          // is exactly what gets saved.
          readOnly={asking}
          maxLength={MENU_LIMITS.kitchenNotes}
          rows={4}
          placeholder={t("No pork. Not too spicy for the kids.", "Tanpa babi. Jangan terlalu pedas untuk anak-anak.")}
          aria-label={t("Kitchen notes", "Catatan dapur")}
          className="rounded-xl text-base"
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "Staff phones can read this. Write only what the cook needs to know.",
            "HP staf bisa membaca catatan ini. Tulis hanya yang perlu diketahui oleh yang memasak."
          )}
        </p>
        {asking ? (
          // The one-time health-data question (D12, migrations/153), asked in
          // place, under the note it is about: it used to replace the whole
          // sheet with "Before you save", and the first Save read as if it
          // hadn't worked (demo check F-5).
          <div
            role="group"
            aria-labelledby="kitchen-notes-confirm"
            className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
            data-testid="kitchen-notes-confirm"
          >
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700" strokeWidth={1.75} />
              <p id="kitchen-notes-confirm" className="text-sm leading-relaxed text-amber-950">
                {t(
                  "One more step, asked only once: this note may include health information about your family, such as allergies. It's shown to your staff so they can cook safely.",
                  "Satu langkah lagi, hanya ditanyakan sekali: catatan ini bisa berisi informasi kesehatan keluarga Anda, misalnya alergi. Catatan ditampilkan kepada staf agar mereka bisa memasak dengan aman."
                )}
              </p>
            </div>
            <Button
              type="button"
              className="min-h-12 rounded-xl text-base"
              onClick={() => void save(true)}
              disabled={saving}
              autoFocus
            >
              {saving && <Loader2 className="animate-spin" />}
              {t("Yes, save the note", "Ya, simpan catatan")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 rounded-xl"
              onClick={() => setAsking(false)}
              disabled={saving}
            >
              {t("Back", "Kembali")}
            </Button>
          </div>
        ) : (
          <Button type="submit" className="min-h-12 rounded-xl text-base" disabled={!changed || saving}>
            {saving && <Loader2 className="animate-spin" />}
            {t("Save", "Simpan")}
          </Button>
        )}
      </div>
    </form>
  );
}
