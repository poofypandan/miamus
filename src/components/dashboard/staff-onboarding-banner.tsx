"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const DISMISSED_KEY = "b11_onboarding_dismissed";

// First-run hint pointing staff at "Add to Home Screen" — the installed PWA
// is what gives them the full screen and the offline log queue from Phase 29,
// so it's worth asking for once. Dismissed permanently on the X.
export function StaffOnboardingBanner() {
  // Starts hidden and is revealed in a mount effect rather than a lazy
  // useState initializer: localStorage doesn't exist during SSR, so reading
  // it while rendering would make the client's first paint disagree with the
  // server HTML. Same reasoning as the owner-role restore in
  // household-context. Hidden-first also means someone who already dismissed
  // this never sees it flash back in on every load.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISSED_KEY) !== "true") setVisible(true);
    } catch {
      // Private browsing or blocked site data — show the hint anyway; the
      // only cost is that the dismissal won't be remembered next time.
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Nothing to recover from: the banner is already closed for this
      // session, it just won't stay closed after a reload.
    }
  }

  if (!visible) return null;

  return (
    <div className="px-4 pt-4">
      <div className="relative rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss tip"
          className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600 active:bg-slate-100"
        >
          <X className="size-4" />
        </button>

        <div className="flex gap-3 pr-9">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <Share className="size-4" />
          </span>

          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm leading-snug font-medium text-slate-900">Add to Home Screen</p>
            <p className="text-[13px] leading-relaxed text-slate-500">
              Tap <span className="font-medium text-slate-700">Share</span> in Safari, or the{" "}
              <span className="font-medium text-slate-700">⋮</span> menu in Chrome, then{" "}
              <span className="font-medium text-slate-700">Add to Home Screen</span> — you get the
              full screen, and logging keeps working when the signal drops.
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
              Tip: tap any pet to open their records, or use the camera in Staff View to log meals
              and potty breaks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
