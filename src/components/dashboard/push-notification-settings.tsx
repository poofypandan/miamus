"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BellOff, BellRing, Loader2, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { sendTestPush } from "@/lib/push";
import type { PushStatus } from "@/lib/push-prompt";
import { usePushStatus } from "@/hooks/use-push-status";
import { useT, type Translate } from "@/context/owner-locale-context";

/** One or two words for this device's push state: the badge and the Household row. */
export function pushStatusLabel(status: PushStatus, t: Translate): string | undefined {
  switch (status) {
    case "on":
      return t("On", "Aktif");
    case "off":
      return t("Off", "Mati");
    case "denied":
      return t("Blocked", "Diblokir");
    case "ios-install-first":
      return t("Needs Home Screen", "Perlu Layar Utama");
    case "unsupported":
    case "unconfigured":
      return t("Not available", "Tidak tersedia");
    default:
      return undefined;
  }
}

const BADGE_CLASS: Partial<Record<PushStatus, string>> = {
  on: "bg-emerald-50 text-emerald-700 border-emerald-200",
  denied: "bg-amber-50 text-amber-800 border-amber-200",
};

function PushStatusBadge({ status, t }: { status: PushStatus; t: Translate }) {
  const label = pushStatusLabel(status, t);
  if (!label) return null;
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        BADGE_CLASS[status] ?? "border-zinc-200 bg-zinc-50 text-zinc-600"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * Push notifications on this device (Phase 119).
 *
 * Per device, like the app lock beside it: a co-owner's phone decides for
 * itself, and turning it on here says nothing about any other phone. It
 * delivers what staff report as urgent (repairs, a sick pet), food from
 * staff and the morning food reminder.
 *
 * Owner-facing, in the language the owner chose (Phase 149).
 */
export function PushNotificationSettings() {
  const t = useT();
  const { status, canEnable, enable: enablePush, disable: disablePush, markOff } = usePushStatus();
  const [busy, setBusy] = useState<"enable" | "disable" | "test" | null>(null);

  async function enable() {
    if (!canEnable || busy) return;
    setBusy("enable");
    try {
      const result = await enablePush();
      if (result === "denied") {
        toast.error(t("Notifications weren't allowed", "Notifikasi tidak diizinkan"));
        return;
      }
      if (result === "enabled") {
        toast.success(t("Notifications on for this device", "Notifikasi aktif di perangkat ini"));
      }
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't turn on notifications", "Notifikasi gagal diaktifkan"));
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy("disable");
    try {
      await disablePush();
      toast.success(t("Notifications off for this device", "Notifikasi mati di perangkat ini"));
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't turn off notifications", "Notifikasi gagal dimatikan"));
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (busy) return;
    setBusy("test");
    try {
      const devices = await sendTestPush();
      if (devices === 0) {
        // The browser still holds a subscription the server no longer has —
        // say so plainly and offer the way back.
        markOff();
        toast.error(
          t(
            "This device isn't registered any more. Turn notifications on again.",
            "Perangkat ini sudah tidak terdaftar. Aktifkan lagi notifikasinya."
          )
        );
        return;
      }
      toast.success(
        devices === 1
          ? t("Test sent", "Tes terkirim")
          : t(`Test sent to ${devices} devices`, `Tes terkirim ke ${devices} perangkat`)
      );
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't send a test notification", "Tes notifikasi gagal dikirim"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">{t("Notifications", "Notifikasi")}</h2>
      <Card className="py-4">
        <CardContent className="flex flex-col gap-3 px-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{t("Notifications on this phone", "Notifikasi di HP ini")}</p>
              <PushStatusBadge status={status} t={t} />
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "An alert on this device the moment staff report something urgent, like a leak, when staff add food, and each morning for food about to expire.",
                "Peringatan di perangkat ini begitu staf melaporkan hal darurat, misalnya kebocoran, saat staf menambahkan makanan, dan setiap pagi untuk makanan yang hampir kedaluwarsa."
              )}
            </p>
          </div>

          {status === "loading" && (
            <div className="flex h-11 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "ios-install-first" && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800"
            >
              <Share className="mt-0.5 size-4 shrink-0 text-zinc-500" />
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {t(
                    "To receive notifications on iPhone, tap 'Share' and 'Add to Home Screen' first.",
                    "Untuk menerima notifikasi di iPhone, ketuk 'Bagikan' lalu 'Tambahkan ke Layar Utama' dulu."
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Then open Miamus from your Home Screen and come back to this tab.",
                    "Lalu buka Miamus dari Layar Utama dan kembali ke tab ini."
                  )}
                </p>
              </div>
            </div>
          )}

          {status === "unsupported" && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t(
                "This browser can't receive push notifications. Chrome, Edge, Firefox and Safari can.",
                "Browser ini tidak bisa menerima notifikasi push. Chrome, Edge, Firefox dan Safari bisa."
              )}
            </p>
          )}

          {status === "unconfigured" && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t(
                "Push notifications aren't set up on the server yet.",
                "Notifikasi push belum disiapkan di server."
              )}
            </p>
          )}

          {status === "denied" && (
            <p className="flex items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <BellOff className="mt-px size-3.5 shrink-0" />
              {t(
                "Notifications are blocked for Miamus on this device. Allow them in your browser or system settings, then come back here.",
                "Notifikasi untuk Miamus diblokir di perangkat ini. Izinkan di pengaturan browser atau sistem, lalu kembali ke sini."
              )}
            </p>
          )}

          {status === "off" && (
            <Button
              className="min-h-[44px] w-full"
              onClick={enable}
              disabled={busy !== null || !canEnable}
            >
              {busy === "enable" ? <Loader2 className="animate-spin" /> : <BellRing />}
              {t("Enable Notifications on this Device", "Aktifkan Notifikasi di Perangkat Ini")}
            </Button>
          )}

          {status === "on" && (
            <>
              <p className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <BellRing className="size-3.5 shrink-0" />{" "}
                {t("On for this device.", "Aktif di perangkat ini.")}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="min-h-[44px] flex-1"
                  onClick={test}
                  disabled={busy !== null}
                >
                  {busy === "test" && <Loader2 className="animate-spin" />}
                  {t("Send test", "Kirim tes")}
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-[44px] flex-1"
                  onClick={disable}
                  disabled={busy !== null}
                >
                  {busy === "disable" && <Loader2 className="animate-spin" />}
                  {t("Turn off", "Matikan")}
                </Button>
              </div>
            </>
          )}

          <p className="text-[11px] text-muted-foreground">
            {t(
              "Each phone or computer is turned on separately. Signing out turns it off here.",
              "Setiap HP atau komputer diaktifkan sendiri-sendiri. Keluar akan mematikannya di sini."
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
