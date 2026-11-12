"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
 * The one main action when Kakak is on (Phase 156 step 2, plan screen 1):
 * her avatar and "Tell Kakak", bottom right, above the tab bar. Rendered on
 * Today, Home, Pets and Kitchen in the owner dashboard (Phase 175 S4; never
 * Settings), and only when kakak_status says this
 * household is on the family list and an owner turned Kakak on — a staff
 * phone gets no status at all, so it never sees the button. Otherwise the tabs
 * look exactly as before.
 */
export function KakakButton() {
  const t = useT();
  const { status } = useKakakStatus();
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    setShowHint(!hintSeen());
  }, []);

  if (!mounted || !status?.allowed || !status.enabled) return null;

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
      {/* Room under the tab's last row, so the button never covers it. */}
      <div aria-hidden="true" className="h-20 shrink-0" />
      {/* On document.body: the pull-to-refresh wrapper is transformed, which
          would make position: fixed relative to it instead of the screen. */}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-30 mx-auto flex w-full max-w-md flex-col items-end gap-1.5 px-4">
          {showHint && (
            <p className="pointer-events-none max-w-[15rem] rounded-xl border bg-background px-3 py-2 text-xs text-gray-900 shadow-sm">
              {t(
                "Kakak can set things up for you — just tell her.",
                "Kakak bisa mengaturnya untuk Anda — cukup bilang saja.",
              )}
            </p>
          )}
          <button
            type="button"
            onClick={press}
            className="pointer-events-auto flex min-h-12 items-center gap-2 rounded-full border bg-background py-1.5 pl-1.5 pr-4 text-sm font-semibold text-gray-900 shadow-lg active:scale-[0.98]"
          >
            <KakakAvatar className="size-9" />
            {t("Tell Kakak", "Bilang ke Kakak")}
          </button>
        </div>,
        document.body,
      )}
      <KakakSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
