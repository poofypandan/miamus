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
      {/* Room under the tab's last row: the band below is 4.75rem tall, so
          the last row ends above it once scrolled to the bottom. */}
      <div aria-hidden="true" className="h-20 shrink-0" />
      {/* On document.body: the pull-to-refresh wrapper is transformed, which
          would make position: fixed relative to it instead of the screen.

          A band in the page's own colour, directly above the tab bar (Phase
          175 check, F1): the button and its first-time hint sit inside it,
          side by side, so neither floats over a row or a button. Content
          scrolls under the band as it does under the tab bar, fading out at
          its top edge, and the band takes the taps there, so a half-hidden
          row is never pressed by mistake. */}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-md">
          <div aria-hidden="true" className="h-3 bg-gradient-to-t from-slate-50 to-slate-50/0" />
          <div
            data-testid="kakak-band"
            className="pointer-events-auto flex items-center justify-end gap-3 bg-slate-50 px-4 pt-1 pb-3"
          >
            {showHint && (
              <p className="min-w-0 flex-1 text-right text-xs leading-snug text-gray-600">
                {t("Kakak can set things up for you.", "Kakak bisa mengaturnya untuk Anda.")}
              </p>
            )}
            <button
              type="button"
              onClick={press}
              className="flex min-h-12 shrink-0 items-center gap-2 rounded-full border bg-background py-1.5 pl-1.5 pr-4 text-sm font-semibold text-gray-900 shadow-sm active:scale-[0.98]"
            >
              <KakakAvatar className="size-9" />
              {t("Tell Kakak", "Bilang ke Kakak")}
            </button>
          </div>
        </div>,
        document.body,
      )}
      <KakakSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
