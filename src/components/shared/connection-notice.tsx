"use client";

import { useState } from "react";
import { Loader2, RotateCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";

const COPY = {
  id: {
    bannerTitle: "Belum tersambung",
    bannerBody: "Ini data terakhir di HP ini. Dicoba lagi otomatis.",
    cardTitle: "Belum bisa memuat data rumah",
    cardBody:
      "Periksa Wi-Fi atau data seluler. Anda tidak keluar dari akun — aplikasi mencoba lagi sendiri.",
    retry: "Coba lagi",
  },
  en: {
    bannerTitle: "Not connected",
    bannerBody: "Showing what this phone last loaded. Retrying automatically.",
    cardTitle: "Couldn't load your household",
    cardBody:
      "Check the Wi-Fi or mobile data. You're still signed in — the app keeps retrying on its own.",
    retry: "Try again",
  },
} as const;

/**
 * What a phone says when the household could not be loaded (Phase 146).
 *
 * Two sizes. With data already on screen — this device's cached copy — a
 * slim strip says it may be out of date, and the lists stay usable. With
 * nothing to show, a card takes the list's place, because an empty list would
 * read as "nothing to do today", which is the one thing it does not mean.
 *
 * Says in so many words that nobody was signed out. Every failure used to
 * look like being thrown out of the house, and the remedy staff reached for —
 * asking for a new invite link — is the thing that actually signed them out.
 *
 * Staff copy in Bahasa Indonesia, owner copy in English (CLAUDE.md).
 */
export function ConnectionNotice({ locale }: { locale: "id" | "en" }) {
  const { syncFailed, hasData, retrySync } = useHousehold();
  const [retrying, setRetrying] = useState(false);
  if (!syncFailed) return null;
  const copy = COPY[locale];

  async function retry() {
    setRetrying(true);
    try {
      await retrySync();
    } finally {
      setRetrying(false);
    }
  }

  const button = (
    <Button
      variant="outline"
      onClick={retry}
      disabled={retrying}
      className="min-h-[44px] shrink-0 rounded-lg border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
    >
      {retrying ? <Loader2 className="animate-spin" /> : <RotateCw />}
      {copy.retry}
    </Button>
  );

  if (hasData) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
      >
        <WifiOff className="size-4 shrink-0 text-amber-700" />
        <p className="min-w-0 flex-1 text-xs text-amber-900">
          <span className="font-medium">{copy.bannerTitle}.</span> {copy.bannerBody}
        </p>
        {button}
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center"
    >
      <WifiOff className="size-6 text-amber-700" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-amber-900">{copy.cardTitle}</p>
        <p className="text-xs text-amber-900/80">{copy.cardBody}</p>
      </div>
      {button}
    </div>
  );
}
