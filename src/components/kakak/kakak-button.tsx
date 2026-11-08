"use client";

import { useState } from "react";
import { KakakAvatar } from "@/components/kakak/kakak-avatar";
import { KakakSheet } from "@/components/kakak/kakak-sheet";
import { useT } from "@/context/owner-locale-context";
import { useKakakStatus } from "@/hooks/use-kakak-status";

const HINT_KEY = "miamus.kakak-hint-seen";

function hintSeen(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * Today's one main action when Kakak is on (Phase 156 step 2, plan screen 1):
 * her avatar and "Tell Kakak", bottom right, above the tab bar. Rendered only
 * on Today in the owner dashboard, and only when kakak_status says this
 * household is on the family list and an owner turned Kakak on — a staff
 * phone gets no status at all, so it never sees the button. Otherwise Today
 * looks exactly as before.
 */
export function KakakButton() {
  const t = useT();
  const { status } = useKakakStatus();
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(() => typeof window !== "undefined" && !hintSeen());

  if (!status?.allowed || !status.enabled) return null;

  function press() {
    setOpen(true);
    if (showHint) {
      setShowHint(false);
      try {
        window.localStorage.setItem(HINT_KEY, "1");
      } catch {
        // Private mode: the hint shows again next time, which is harmless.
      }
    }
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-30 mx-auto flex w-full max-w-md flex-col items-end gap-1.5 px-4">
        <button
          type="button"
          onClick={press}
          className="pointer-events-auto flex min-h-12 items-center gap-2 rounded-full border bg-background py-1.5 pl-1.5 pr-4 text-sm font-semibold text-gray-900 shadow-lg active:scale-[0.98]"
        >
          <KakakAvatar className="size-9" />
          {t("Tell Kakak", "Bilang ke Kakak")}
        </button>
        {showHint && (
          <p className="pointer-events-none max-w-[16rem] text-right text-xs text-muted-foreground">
            {t("Kakak can set things up for you — just tell her.", "Kakak bisa mengaturnya untuk Anda — cukup bilang saja.")}
          </p>
        )}
      </div>
      <KakakSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
