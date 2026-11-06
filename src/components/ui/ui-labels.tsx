"use client";

import { createContext, useContext, type ReactNode } from "react";

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
    close: "Close",
    previousPhoto: "Previous photo",
    nextPhoto: "Next photo",
    backspace: "Delete last digit",
    loading: "Loading",
  },
  id: {
    close: "Tutup",
    previousPhoto: "Foto sebelumnya",
    nextPhoto: "Foto berikutnya",
    backspace: "Hapus angka terakhir",
    loading: "Memuat",
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
