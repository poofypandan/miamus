"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Loader2, Lock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RELOCK_AFTER_MS,
  isAppLockEnabled,
  setAppLockEnabled,
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
 * in Phase 93, biometric-only since Phase 108).
 *
 * Off unless the owner turns it on: Google sign-in decides who gets in and the
 * middleware enforces it before this renders. What the lock guards against is
 * the one thing it can — someone else picking up an unlocked phone.
 *
 * There is no PIN behind the sensor any more. The owner PIN was a constant in
 * the bundle, and doubled as a way to make any device "owner". The fallback
 * for a sensor that will not cooperate is now the owner's real credential:
 * sign out, and sign back in with Google. That turns the lock off on this
 * device, which is right — whoever completes the Google sign-in is the owner.
 *
 * The content stays mounted and blurred behind the prompt rather than being
 * unmounted: the dashboard is expensive to build, and re-mounting it on every
 * unlock would re-fetch the whole household.
 */
export function OwnerAppLock({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Starts unlocked and stays that way through the first paint: the lock is
  // off for most people, and reading localStorage during render would make
  // the server HTML and the client's first render disagree.
  const [locked, setLocked] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  const unlock = useCallback(() => {
    setLocked(false);
    try {
      window.sessionStorage.setItem(UNLOCKED_KEY, String(Date.now()));
    } catch {
      // Blocked storage: this tab is unlocked, a reload asks again.
    }
  }, []);

  const tryBiometric = useCallback(async () => {
    setBiometricBusy(true);
    const ok = await verifyBiometric();
    setBiometricBusy(false);
    // A refused or cancelled prompt leaves the lock screen up with its two
    // choices rather than re-prompting in a loop.
    if (ok) unlock();
  }, [unlock]);

  async function signOut() {
    setSigningOut(true);
    // Off first: the next person through is whoever passes Google sign-in,
    // which is a stronger check than this lock ever was.
    setAppLockEnabled(false);
    try {
      const { supabase } = await import("@/lib/supabase/client");
      await supabase?.auth.signOut();
    } finally {
      // "/" is the sign-in page; the middleware keeps /dashboard behind it.
      router.replace("/");
    }
  }

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
              Unlock with Face ID or your fingerprint.
            </p>

            <div className="mt-6 flex w-full flex-col gap-2">
              <Button
                className="min-h-[48px] w-full"
                disabled={biometricBusy || signingOut}
                onClick={() => void tryBiometric()}
              >
                <Fingerprint /> {biometricBusy ? "Waiting…" : "Unlock"}
              </Button>
              <Button
                variant="ghost"
                className="min-h-[44px] w-full text-muted-foreground"
                disabled={signingOut}
                onClick={() => void signOut()}
              >
                {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out and
                sign in with Google
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
