"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { formatTime } from "@/lib/time";

/**
 * The few words the shared UI primitives say on their own — a dialog's close
 * button, the photo viewer's arrows, the PIN pad's delete key, the loading
 * bar — in the language of the screen they sit
 * on (Phase 149). Mostly heard by screen readers.
 *
 * The owner screens get theirs from OwnerLocaleProvider; the staff page wraps
 * itself in locale="id". Outside either, English, as before.
 */
const LABELS = {
  en: {
    lang: "en",
    close: "Close",
    previousPhoto: "Previous photo",
    nextPhoto: "Next photo",
    backspace: "Delete last digit",
    loading: "Loading",
    promise: "A little less on your mind.",
  },
  id: {
    lang: "id",
    close: "Tutup",
    previousPhoto: "Foto sebelumnya",
    nextPhoto: "Foto berikutnya",
    backspace: "Hapus angka terakhir",
    loading: "Memuat",
    promise: "Biar pikiran sedikit lebih ringan.",
  },
} as const;

type UiLabels = (typeof LABELS)[keyof typeof LABELS];

const UiLabelsContext = createContext<UiLabels>(LABELS.en);

export function UiLabelsProvider({ locale, children }: { locale: "en" | "id"; children: ReactNode }) {
  return <UiLabelsContext.Provider value={LABELS[locale]}>{children}</UiLabelsContext.Provider>;
}

export function useUiLabels(): UiLabels {
  return useContext(UiLabelsContext);
}

/** The language of the screen this sits on: the owner's choice, or "id" on staff screens. */
export function useScreenLang(): "en" | "id" {
  return useContext(UiLabelsContext).lang;
}

/**
 * Times in the screen's language (Phase 149): "6:00 AM" for an English owner,
 * "06.00" for an Indonesian owner and on every staff screen. One argument, so
 * it can be passed straight to .map().
 */
export function useFormatTime(): (value: string | Date) => string {
  const lang = useScreenLang();
  return useCallback((value: string | Date) => formatTime(value, lang), [lang]);
}
