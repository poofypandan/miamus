"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Fingerprint, Lock } from "lucide-react";
import { PinPad, PIN_LENGTH } from "@/components/auth/pin-pad";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import {
  RELOCK_AFTER_MS,
  hasBiometricCredential,
  isAppLockEnabled,
  verifyBiometric,
} from "@/lib/app-lock";
import { cn } from "@/lib/utils";

// Unlocked-ness lives in sessionStorage, not localStorage: it should survive a
// reload and moving between dashboard screens, and die with the tab. A phone
// handed to someone else with the app closed is locked again.
const UNLOCKED_KEY = "miamus_owner_unlocked_at";

function readUnlockedAt(): number {
  try {
    return Number(window.sessionStorage.getItem(UNLOCKED_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * The owner's optional screen lock over the dashboard (Phase 87, made opt-in
 * in Phase 93).
 *
 * It used to demand a PIN on every single visit, which is friction for almost
 * no gain: Google sign-in decides who gets in and the middleware enforces it
 * before this renders. So it is off unless the owner turns it on, and what it
 * guards against is the specific thing a lock can guard — someone else
 * picking up an unlocked phone.
 *
 * When on, the device's own biometric prompt is tried first and the PIN is
 * always there behind it, because a sensor can be wet, cold, or simply absent.
 *
 * The content stays mounted and blurred behind the prompt rather than being
 * unmounted: the dashboard is expensive to build, and re-mounting it on every
 * unlock would re-fetch the whole household.
 */
export function OwnerAppLock({ children }: { children: ReactNode }) {
  const { unlockOwner } = useHousehold();
  // Starts unlocked and stays that way through the first paint: the lock is
  // off for most people, and reading localStorage during render would make
  // the server HTML and the client's first render disagree.
  const [locked, setLocked] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  const unlock = useCallback(() => {
    setLocked(false);
    setPin("");
    setShowPin(false);
    try {
      window.sessionStorage.setItem(UNLOCKED_KEY, String(Date.now()));
    } catch {
      // Blocked storage: this tab is unlocked, a reload asks again.
    }
  }, []);

  const tryBiometric = useCallback(async () => {
    if (!hasBiometricCredential()) {
      setShowPin(true);
      return;
    }
    setBiometricBusy(true);
    const ok = await verifyBiometric();
    setBiometricBusy(false);
    if (ok) unlock();
    // A refused or cancelled prompt falls through to the pad rather than
    // nagging: the person may simply prefer typing.
    else setShowPin(true);
  }, [unlock]);

  useEffect(() => {
    const on = isAppLockEnabled();
    setEnabled(on);
    if (!on) return;

    const unlockedAt = readUnlockedAt();
    if (unlockedAt && Date.now() - unlockedAt < RELOCK_AFTER_MS) {
      // Already unlocked in this tab, and recently enough: challenging again
      // to come back from a photo would be theatre, not security.
      return;
    }
    setLocked(true);
    void tryBiometric();
  }, [tryBiometric]);

  // Re-locks after a spell in the background. Measured from when the app was
  // hidden rather than on a timer, so a phone in a pocket for an hour is
  // locked the moment it is looked at again — while the camera round-trip
  // from logging a task is well inside the grace period.
  useEffect(() => {
    if (!enabled) return;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (away > RELOCK_AFTER_MS) {
        setLocked(true);
        void tryBiometric();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, tryBiometric]);

  function pressDigit(digit: string) {
    if (shake || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length < PIN_LENGTH) return;

    // unlockOwner also flips the app into owner mode, which some owner-only
    // screens still read — one gesture, not two.
    if (unlockOwner(next)) {
      unlock();
    } else {
      setShake(true);
      setTimeout(() => {
        setPin("");
        setShake(false);
      }, 400);
    }
  }

  return (
    <div className="relative">
      {/* aria-hidden and inert while locked, so a screen reader or a stray
          tab press can't reach the blurred dashboard behind the prompt. */}
      <div
        className={cn(locked && "pointer-events-none blur-md")}
        aria-hidden={locked}
        {...(locked ? { inert: "" as unknown as boolean } : {})}
      >
        {children}
      </div>

      {locked && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 px-6 backdrop-blur-sm">
          <div className="flex w-full max-w-xs flex-col items-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Lock className="size-5" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">Locked</h2>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              {showPin
                ? "Enter your 4-digit PIN to unlock the dashboard."
                : "Unlock with Face ID or your fingerprint."}
            </p>

            {showPin ? (
              <div className="mt-6 w-full">
                <PinPad
                  pin={pin}
                  shake={shake}
                  onDigit={pressDigit}
                  onBackspace={() => setPin((p) => p.slice(0, -1))}
                />
                {hasBiometricCredential() && (
                  <Button
                    variant="ghost"
                    className="mt-2 min-h-[44px] w-full text-muted-foreground"
                    disabled={biometricBusy}
                    onClick={() => void tryBiometric()}
                  >
                    <Fingerprint /> Try Face ID instead
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-6 flex w-full flex-col gap-2">
                <Button
                  className="min-h-[48px] w-full"
                  disabled={biometricBusy}
                  onClick={() => void tryBiometric()}
                >
                  <Fingerprint /> {biometricBusy ? "Waiting…" : "Unlock"}
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-[44px] w-full text-muted-foreground"
                  onClick={() => setShowPin(true)}
                >
                  Use PIN instead
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
