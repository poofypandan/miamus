"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Check, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { readActiveStaffId } from "@/components/auth/staff-login-gate";
import { useBackToClose } from "@/hooks/use-back-to-close";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_MAX_LENGTH,
  feedbackErrorKind,
  feedbackPage,
  sendFeedback,
} from "@/lib/feedback";
import type { OwnerLocale } from "@/lib/owner-locale";
import { cn } from "@/lib/utils";
import type { FeedbackCategory } from "@/types/database";

/**
 * "Send feedback" / "Kirim masukan" (roadmap item 9, migrations/135): a
 * message (required), an optional kind, and a calm thank-you. Shared by
 * owners (About Miamus, in their language) and staff phones (the Lapor
 * sheet; locale "id" and `asStaff`, which names the person on duty).
 */
export function FeedbackSheet({
  open,
  onClose,
  locale,
  asStaff = false,
}: {
  open: boolean;
  onClose: () => void;
  locale: OwnerLocale;
  asStaff?: boolean;
}) {
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md gap-0 overflow-y-auto rounded-t-2xl">
        {/* Mounted only while open, so each opening starts with an empty box. */}
        {open && <FeedbackForm locale={locale} asStaff={asStaff} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function FeedbackForm({ locale, asStaff, onDone }: { locale: OwnerLocale; asStaff: boolean; onDone: () => void }) {
  const ind = locale === "id";
  const tr = (en: string, id: string) => (ind ? id : en);
  const ids = { message: useId(), kind: useId(), count: useId() };
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);

  const canSend = message.trim().length > 0 && !saving;

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    const staffId = asStaff ? readActiveStaffId() : null;
    if (asStaff && !staffId) {
      toast.error("Pilih nama Anda dulu, lalu coba lagi.");
      return;
    }
    setSaving(true);
    try {
      await sendFeedback({
        message,
        category,
        staffId,
        page: feedbackPage(window.location.pathname, window.location.search),
      });
      setSent(true);
    } catch (err) {
      console.error(err);
      const kind = feedbackErrorKind(err);
      toast.error(
        kind === "too_many"
          ? tr("That's a lot for one day. Please try again tomorrow.", "Sudah banyak pesan hari ini. Coba lagi besok, ya.")
          : kind === "who"
            ? "Pilih nama Anda dulu, lalu coba lagi."
            : tr("Couldn't send. Check the connection and try again.", "Gagal mengirim. Cek koneksi, lalu coba lagi.")
      );
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 px-6 pt-8 pb-6 text-center">
        <SheetHeader className="sr-only">
          <SheetTitle>{tr("Send feedback", "Kirim masukan")}</SheetTitle>
          <SheetDescription>{tr("Sent", "Terkirim")}</SheetDescription>
        </SheetHeader>
        <span className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <CheckCircle2 className="size-7" strokeWidth={1.75} />
        </span>
        <p className="text-lg font-semibold text-gray-900">{tr("Thank you", "Terima kasih")}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {tr("Your message reached the Miamus team.", "Pesan Anda sudah sampai ke tim Miamus.")}
        </p>
        <Button type="button" variant="outline" onClick={onDone} className="mt-3 min-h-[48px] w-full rounded-xl text-base">
          {tr("Done", "Selesai")}
        </Button>
      </div>
    );
  }

  const left = FEEDBACK_MAX_LENGTH - message.length;

  return (
    <form onSubmit={send} className="flex flex-col">
      <SheetHeader className="pb-2">
        <SheetTitle className="text-center text-lg font-semibold">{tr("Send feedback", "Kirim masukan")}</SheetTitle>
        <SheetDescription className="text-center">
          {asStaff
            ? "Ada ide atau masalah di aplikasi? Tulis di sini. Dibaca tim Miamus dan pemilik rumah."
            : tr(
                "An idea, or something that went wrong? We read every message.",
                "Ada ide, atau sesuatu yang tidak beres? Kami membaca setiap pesan."
              )}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 px-4 pb-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.message} className="text-xs">
            {tr("Your message", "Pesan Anda")}
          </Label>
          <Textarea
            id={ids.message}
            value={message}
            maxLength={FEEDBACK_MAX_LENGTH}
            onChange={(e) => setMessage(e.target.value)}
            aria-describedby={ids.count}
            placeholder={tr("What would make Miamus better for you?", "Apa yang bisa membuat Miamus lebih baik?")}
            className="min-h-32"
          />
          <p
            id={ids.count}
            className={cn("text-right text-[11px] tabular-nums", left < 100 ? "text-amber-700" : "text-muted-foreground")}
          >
            {left < 100
              ? tr(`${left} characters left`, `Sisa ${left} karakter`)
              : tr(`Up to ${FEEDBACK_MAX_LENGTH} characters`, `Maksimal ${FEEDBACK_MAX_LENGTH} karakter`)}
          </p>
        </div>

        <div role="group" aria-labelledby={ids.kind} className="flex flex-col gap-1.5">
          <span id={ids.kind} className="text-xs font-medium">
            {/* Staff forms never say "opsional" (docs/indonesian-glossary.md). */}
            {asStaff ? "Jenis (boleh dikosongkan)" : tr("Type (optional)", "Jenis (opsional)")}
          </span>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_CATEGORIES.map((kind) => {
              const on = category === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategory(on ? null : kind)}
                  className={cn(
                    "flex min-h-[40px] items-center gap-1 rounded-full border px-3.5 text-sm",
                    on ? "border-gray-900 bg-gray-900 font-medium text-white" : "bg-background active:bg-muted"
                  )}
                >
                  {on && <Check className="size-3.5" />}
                  {FEEDBACK_CATEGORY_LABELS[kind][ind ? "id" : "en"]}
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {tr(
            "Sent with the screen you were on and the app version. Nothing else from your phone.",
            "Dikirim bersama halaman yang sedang dibuka dan versi aplikasi. Tidak ada data lain dari HP Anda."
          )}
        </p>

        <Button type="submit" disabled={!canSend} className="min-h-[52px] rounded-xl text-base">
          {saving && <Loader2 className="animate-spin" />}
          {tr("Send", "Kirim")}
        </Button>
      </div>
    </form>
  );
}
