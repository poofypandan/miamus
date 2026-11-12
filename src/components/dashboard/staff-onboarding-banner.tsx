"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useSetupStage } from "@/hooks/use-setup-stage";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { homeScreenTipAllowed } from "@/lib/calm-start";
import { useBannerShowing } from "@/hooks/use-top-banners";
import { VideoTip } from "@/components/shared/video-tip";

export const INSTALL_TIP_DISMISSED_KEY = "b11_onboarding_dismissed";
/** Fired when the tip is closed, so the notifications prompt can take its place (push-prompt.tsx). */
export const INSTALL_TIP_DISMISSED_EVENT = "miamus:install-tip-dismissed";
const DISMISSED_KEY = INSTALL_TIP_DISMISSED_KEY;

// The owner's "Add to Home Screen" tip on the dashboard (the name is
// historical: it once pointed staff at it too). The installed app is what
// gives full screen, the offline queue and, on iPhone, notifications.
// Dismissed permanently on the X.
//
// Phase 172 (D11, rules 5 and 7): it waits until the first-run checklist's
// "first task" step is done, so a new owner's first Today is the checklist
// alone; and it is one line, plus an optional video tip. The pet tip went.
export function StaffOnboardingBanner() {
  // Starts hidden and is revealed in a mount effect rather than a lazy
  // useState initializer: localStorage doesn't exist during SSR, so reading
  // it while rendering would make the client's first paint disagree with the
  // server HTML. Same reasoning as the owner-role restore in
  // household-context. Hidden-first also means someone who already dismissed
  // this never sees it flash back in on every load.
  const [visible, setVisible] = useState(false);
  const { isStandalone } = usePwaInstall();
  const t = useT();
  const locale = useOwnerLocale();
  const stage = useSetupStage();
  // One ask at a time (Phase 175 check, P2): not with the notifications
  // prompt, which goes first, nor over Today's Set up card.
  const pushPromptShowing = useBannerShowing("pushPrompt");
  const setupCardShowing = useBannerShowing("setupCard");

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
    window.dispatchEvent(new Event(INSTALL_TIP_DISMISSED_EVENT));
    try {
      window.localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Nothing to recover from: the banner is already closed for this
      // session, it just won't stay closed after a reload.
    }
  }

  // Already installed: the tip has done its job, so it never shows inside the
  // home-screen app regardless of whether it was ever dismissed.
  if (!visible || isStandalone || !homeScreenTipAllowed(stage) || pushPromptShowing || setupCardShowing) return null;

  return (
    // standalone:hidden backs up the JS check with a pure CSS guard.
    <div className="px-4 pt-4 standalone:hidden">
      <div className="relative rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("Dismiss tip", "Tutup tips")}
          className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 active:bg-slate-100"
        >
          <X className="size-4" />
        </button>

        <div className="flex gap-3 pr-9">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <Share className="size-4" />
          </span>

          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm leading-snug font-medium text-slate-900">
              {t(
                "Add Miamus to your Home Screen for notifications.",
                "Tambahkan Miamus ke Layar Utama agar dapat notifikasi."
              )}
            </p>
            <VideoTip id="owner-home-screen" locale={locale} />
          </div>
        </div>
      </div>
    </div>
  );
}
