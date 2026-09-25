"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  hasBiometricCredential,
  isAppLockEnabled,
  isBiometricAvailable,
  registerBiometric,
  setAppLockEnabled,
} from "@/lib/app-lock";

/**
 * The owner's device-level lock setting (Phase 93).
 *
 * Off by default, and local to this device: it is about who can pick up *this
 * phone*, not about the household. A second owner's phone decides for itself.
 *
 * Owner-facing, so entirely English per the Phase 46 language boundary.
 */
export function SecuritySettings() {
  // Read after mount, never during render: the server has no localStorage and
  // a mismatch would be a hydration error.
  const [enabled, setEnabled] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(isAppLockEnabled());
    setBiometricReady(hasBiometricCredential());
    void isBiometricAvailable().then(setAvailable);
  }, []);

  async function toggle() {
    if (busy) return;
    if (enabled) {
      setAppLockEnabled(false);
      setEnabled(false);
      setBiometricReady(false);
      toast.success("App lock turned off");
      return;
    }

    setBusy(true);
    try {
      // Enrol first, then turn the setting on: the PIN is always a fallback,
      // so a device without a sensor (or an owner who cancels the prompt)
      // still gets a working lock rather than a failed one.
      const enrolled = available ? await registerBiometric("Miamus owner") : false;
      setAppLockEnabled(true);
      setEnabled(true);
      setBiometricReady(enrolled);
      toast.success(
        enrolled ? "App lock on — Face ID or PIN" : "App lock on — PIN only on this device"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">Security</h2>
      <Card className="py-4">
        <CardContent className="flex flex-col gap-3 px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium">Require authentication to open app</p>
              <p className="text-xs text-muted-foreground">
                Locks the dashboard on this phone after 5 minutes away. Unlocks with Face ID or
                your fingerprint, and always accepts your 4-digit PIN.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Require authentication to open app"
              disabled={busy}
              onClick={toggle}
              className={cn(
                "relative mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
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
              {biometricReady ? (
                <>
                  <Fingerprint className="size-3.5 shrink-0" /> Face ID or fingerprint is set up on
                  this device.
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3.5 shrink-0" /> This device will ask for your PIN.
                </>
              )}
            </p>
          )}

          {/* Said plainly rather than implied: this lock is about the phone in
              someone's hand. What keeps the household's data private is the
              database (Phase 88/90), which this setting does not touch. */}
          <p className="text-[11px] text-muted-foreground">
            This protects the app on this phone only. Your household data stays protected by your
            Google sign-in either way.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
