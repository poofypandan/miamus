"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Languages, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useOwnerLocaleContext } from "@/context/owner-locale-context";
import { LOCALE_NAMES, OWNER_LOCALES, type OwnerLocale } from "@/lib/owner-locale";
import { cn } from "@/lib/utils";

const COPY = {
  en: {
    heading: "Language",
    label: "Language",
    hint: "For you on every phone you sign in on, and for your notifications. Staff screens stay in Bahasa Indonesia.",
    saved: "Language set to English",
    failed: "Couldn't save your language. Try again.",
  },
  id: {
    heading: "Bahasa",
    label: "Bahasa",
    hint: "Berlaku untuk Anda di setiap HP tempat Anda masuk, dan untuk notifikasi Anda. Layar staf tetap dalam Bahasa Indonesia.",
    saved: "Bahasa diubah ke Bahasa Indonesia",
    failed: "Bahasa gagal disimpan. Coba lagi.",
  },
} as const;

/** The Access tab's language switch (Phase 149). */
export function LanguageSettings() {
  const { locale, setLocale } = useOwnerLocaleContext();
  const t = COPY[locale];

  async function change(next: OwnerLocale) {
    if (next === locale) return;
    const saved = await setLocale(next);
    if (saved) toast.success(COPY[next].saved);
    else toast.error(t.failed);
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">{t.heading}</h2>
      <Card className="py-4">
        <CardContent className="flex flex-col gap-3 px-4">
          <SegmentedControl
            ariaLabel={t.label}
            value={locale}
            onChange={(next) => void change(next)}
            segments={OWNER_LOCALES.map((value) => ({ value, label: LOCALE_NAMES[value] }))}
          />
          <p className="text-xs text-muted-foreground">{t.hint}</p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Two large buttons, each language named in itself (Phase 149). The first
 * thing a new owner sees at /onboarding, and the body of LanguagePrompt.
 */
export function LanguageChoice({ onChosen }: { onChosen?: (locale: OwnerLocale) => void }) {
  const { locale, chosen, setLocale } = useOwnerLocaleContext();
  const [saving, setSaving] = useState<OwnerLocale | null>(null);
  const [failed, setFailed] = useState(false);

  async function choose(next: OwnerLocale) {
    if (saving) return;
    setSaving(next);
    setFailed(false);
    const saved = await setLocale(next);
    setSaving(null);
    if (saved) onChosen?.(next);
    else setFailed(true);
  }

  return (
    <div className="flex flex-col gap-2">
      {OWNER_LOCALES.map((value) => {
        const current = chosen === true && value === locale;
        return (
          <button
            key={value}
            type="button"
            lang={value}
            onClick={() => void choose(value)}
            disabled={saving !== null}
            className={cn(
              "flex min-h-[56px] items-center justify-between gap-3 rounded-xl border px-4 text-left text-base font-medium transition-colors",
              current
                ? "border-primary bg-primary/5 text-gray-900"
                : "border-border bg-background text-gray-900 active:bg-muted"
            )}
          >
            {LOCALE_NAMES[value]}
            {saving === value ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              current && <Check className="size-4 text-primary" />
            )}
          </button>
        );
      })}
      {failed && (
        <p className="text-sm text-destructive">
          <span lang="en">Couldn&apos;t save. Try again.</span>{" "}
          <span lang="id">· Gagal disimpan. Coba lagi.</span>
        </p>
      )}
    </div>
  );
}

/**
 * Asks once, on the dashboard, an owner who has never chosen — a co-owner who
 * joined by invite and skipped /onboarding (Phase 149). Every account that
 * had a household before this phase is recorded as English (migrations/114),
 * so they are never asked.
 */
export function LanguagePrompt() {
  const { chosen } = useOwnerLocaleContext();
  const [dismissed, setDismissed] = useState(false);
  const open = chosen === false && !dismissed;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && setDismissed(true)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <Languages className="size-5" />
          </span>
          <DialogTitle>
            <span lang="en">Choose your language</span>
            <span lang="id" className="block text-base font-medium text-muted-foreground">
              Pilih bahasa Anda
            </span>
          </DialogTitle>
          <DialogDescription>
            <span lang="en">You can change it any time in Access.</span>{" "}
            <span lang="id">Bisa diubah kapan saja di Akses.</span>
          </DialogDescription>
        </DialogHeader>
        <LanguageChoice onChosen={() => setDismissed(true)} />
      </DialogContent>
    </Dialog>
  );
}
