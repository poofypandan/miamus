"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BellOff, BellRing, Loader2, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  INSTALL_TIP_DISMISSED_EVENT,
  INSTALL_TIP_DISMISSED_KEY,
} from "@/components/dashboard/staff-onboarding-banner";
import { useT } from "@/context/owner-locale-context";
import { usePushStatus } from "@/hooks/use-push-status";
import { pushInPlace } from "@/lib/in-place-navigation";
import { readSnooze, shouldShowPushPrompt, snoozeUntil, writeSnooze } from "@/lib/push-prompt";

function installTipShowing(): boolean {
  try {
    return localStorage.getItem(INSTALL_TIP_DISMISSED_KEY) !== "true";
  } catch {
    return true;
  }
}

/**
 * Asks the owner to turn notifications on for this device (2026-11-10).
 *
 * Until now the only way in was Household → Notifications, and production had
 * no subscriptions at all: urgent staff reports reached nobody. This sits at
 * the top of the dashboard on any device where push is off, explains it in a
 * line, and turns it on with one tap (the tap itself asks the browser, which
 * Safari requires). On an iPhone in a browser tab it says how to get to where
 * iPhone allows it; where notifications are blocked, where to unblock them.
 * "Not now" hides it on this device for a week (a month when blocked).
 *
 * Decided after mount: the server has no storage, and a card that flashed in
 * and out would be worse than one that appears a moment late.
 */
export function PushPrompt() {
  const t = useT();
  const { status, canEnable, enable } = usePushStatus();
  const [snoozed, setSnoozed] = useState<number | null | undefined>(undefined);
  const [tipShowing, setTipShowing] = useState(true);
  const [busy, setBusy] = useState(false);
  // Not on Household → Notifications itself, which says it all already.
  const searchParams = useSearchParams();
  const onSettingsPage = searchParams.get("module") === "access" && searchParams.get("page") === "notifications";

  useEffect(() => {
    setSnoozed(readSnooze());
    setTipShowing(installTipShowing());
    // Closing the Add to Home Screen tip makes room for this one (Codex, #50).
    const onTipDismissed = () => setTipShowing(false);
    window.addEventListener(INSTALL_TIP_DISMISSED_EVENT, onTipDismissed);
    return () => window.removeEventListener(INSTALL_TIP_DISMISSED_EVENT, onTipDismissed);
  }, []);

  if (onSettingsPage || snoozed === undefined || !shouldShowPushPrompt(status, snoozed, Date.now(), tipShowing)) {
    return null;
  }

  function later() {
    const until = snoozeUntil(status, Date.now());
    writeSnooze(until);
    setSnoozed(until);
  }

  async function turnOn() {
    if (!canEnable || busy) return;
    setBusy(true);
    try {
      const result = await enable();
      if (result === "enabled") {
        toast.success(t("Notifications on for this device", "Notifikasi aktif di perangkat ini"));
      } else if (result === "denied") {
        toast.error(t("Notifications weren't allowed", "Notifikasi tidak diizinkan"));
      }
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't turn on notifications", "Notifikasi gagal diaktifkan"));
    } finally {
      setBusy(false);
    }
  }

  const Icon = status === "denied" ? BellOff : status === "ios-install-first" ? Share : BellRing;
  const title =
    status === "denied"
      ? t("Notifications are blocked", "Notifikasi diblokir")
      : status === "ios-install-first"
        ? t("Notifications on iPhone", "Notifikasi di iPhone")
        : t("Turn on notifications", "Aktifkan notifikasi");
  const body =
    status === "denied"
      ? t(
          "Miamus can't alert you on this phone. Allow notifications for Miamus in your browser or phone settings.",
          "Miamus tidak bisa memberi peringatan di HP ini. Izinkan notifikasi untuk Miamus di pengaturan browser atau HP."
        )
      : status === "ios-install-first"
        ? t(
            "Tap Share, then Add to Home Screen. Open Miamus from your Home Screen and turn notifications on there.",
            "Ketuk Bagikan, lalu Tambahkan ke Layar Utama. Buka Miamus dari Layar Utama, lalu aktifkan notifikasi di sana."
          )
        : t(
            "Get an alert on this phone the moment staff report something urgent, like a leak.",
            "Dapatkan peringatan di HP ini begitu staf melaporkan hal darurat, misalnya kebocoran."
          );

  return (
    <div className="px-4 pt-3">
      <section
        aria-label={title}
        className={`relative rounded-2xl border px-4 py-3.5 shadow-sm animate-view-fade motion-reduce:animate-none ${
          status === "denied" ? "border-amber-200 bg-amber-50/60" : "border-slate-200/80 bg-white"
        }`}
      >
        <button
          type="button"
          onClick={later}
          aria-label={t("Not now", "Nanti saja")}
          className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 active:bg-slate-100"
        >
          <X className="size-4" />
        </button>
        <div className="flex gap-3 pr-9">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm leading-snug font-medium text-slate-900">{title}</p>
            <p className="text-[13px] leading-relaxed text-slate-500">{body}</p>
          </div>
        </div>
        <div className="flex gap-2 pt-3">
          {status === "off" ? (
            <>
              <Button className="min-h-[44px] flex-1" onClick={turnOn} disabled={busy || !canEnable}>
                {busy ? <Loader2 className="animate-spin" /> : <BellRing />}
                {t("Turn on", "Aktifkan")}
              </Button>
              <Button variant="outline" className="min-h-[44px] flex-1" onClick={later} disabled={busy}>
                {t("Not now", "Nanti saja")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="min-h-[44px] flex-1"
                onClick={() => pushInPlace("/dashboard?module=access&page=notifications")}
              >
                {t("Details", "Selengkapnya")}
              </Button>
              <Button variant="ghost" className="min-h-[44px] flex-1" onClick={later}>
                {t("Got it", "Mengerti")}
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
