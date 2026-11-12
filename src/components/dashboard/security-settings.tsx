"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Fingerprint, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  isAppLockEnabled,
  isBiometricAvailable,
  registerBiometric,
  setAppLockEnabled,
} from "@/lib/app-lock";
import { useT } from "@/context/owner-locale-context";

/**
 * The owner's device-level lock setting (Phase 93).
 *
 * Off by default, and local to this device: it is about who can pick up *this
 * phone*, not about the household. A second owner's phone decides for itself.
 *
 * Biometric-only since Phase 108, when the owner PIN that stood behind the
 * sensor was removed. A device without Face ID or a fingerprint reader cannot
 * turn the lock on, rather than getting a lock nothing can open.
 *
 * Owner-facing, in the language the owner chose (Phase 149).
 */
export function SecuritySettings() {
  // Read after mount, never during render: the server has no localStorage and
  // a mismatch would be a hydration error.
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(isAppLockEnabled());
    void isBiometricAvailable().then(setAvailable);
  }, []);

  async function toggle() {
    if (busy) return;
    if (enabled) {
      setAppLockEnabled(false);
      setEnabled(false);
      toast.success(t("App lock turned off", "Kunci aplikasi dimatikan"));
      return;
    }

    setBusy(true);
    try {
      // Enrol first, and turn the setting on only if that worked: with no PIN
      // behind it, a lock without an enrolled sensor could never be opened.
      const enrolled = await registerBiometric("Miamus admin");
      if (!enrolled) {
        toast.error(
          t(
            "Face ID or fingerprint wasn't set up, so the lock stays off",
            "Face ID atau sidik jari belum diatur, jadi kunci tetap mati"
          )
        );
        return;
      }
      setAppLockEnabled(true);
      setEnabled(true);
      toast.success(t("App lock on", "Kunci aplikasi aktif"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">{t("App lock", "Kunci aplikasi")}</h2>
      <Card className="py-4">
        <CardContent className="flex flex-col gap-3 px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium">
                {t("Lock with Face ID", "Kunci dengan Face ID")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Locks the dashboard on this phone after 5 minutes away. Unlocks with Face ID or your fingerprint, or by signing in with Google again.",
                  "Mengunci dasbor di HP ini setelah 5 menit ditinggal. Dibuka dengan Face ID atau sidik jari, atau dengan masuk lagi lewat Google."
                )}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={t("Lock with Face ID", "Kunci dengan Face ID")}
              // Turning it off is always allowed; turning it on needs a sensor.
              disabled={busy || (!enabled && !available)}
              onClick={toggle}
              className={cn(
                "relative mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full disabled:opacity-50",
                enabled ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full bg-white shadow-sm transition-transform",
                  enabled ? "translate-x-[22px]" : "translate-x-0.5"
                )}
              >
                {busy && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
              </span>
            </button>
          </div>

          {enabled && (
            <p className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Fingerprint className="size-3.5 shrink-0" />{" "}
              {t("Face ID or fingerprint is set up on this device.", "Face ID atau sidik jari sudah diatur di perangkat ini.")}
            </p>
          )}
          {!enabled && !available && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t(
                "This device has no Face ID or fingerprint reader the browser can use, so the lock isn't available here.",
                "Perangkat ini tidak punya Face ID atau pembaca sidik jari yang bisa dipakai browser, jadi kunci tidak tersedia di sini."
              )}
            </p>
          )}

          {/* Said plainly rather than implied: this lock is about the phone in
              someone's hand. What keeps the household's data private is the
              database (Phase 88/90), which this setting does not touch. */}
          <p className="text-[11px] text-muted-foreground">
            {t(
              "This protects the app on this phone only. Your home's data stays protected by your Google sign-in either way.",
              "Ini hanya melindungi aplikasi di HP ini. Data rumah Anda tetap terlindungi oleh login Google Anda."
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
