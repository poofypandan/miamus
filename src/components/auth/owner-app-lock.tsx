"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { PinPad, PIN_LENGTH } from "@/components/auth/pin-pad";
import { useHousehold } from "@/context/household-context";
import { cn } from "@/lib/utils";

// Unlocked-ness lives in sessionStorage, not localStorage: it should survive a
// reload and moving between dashboard screens, and die with the tab. A phone
// handed to someone else with the app closed is locked again.
const UNLOCKED_KEY = "miamus_owner_unlocked_at";
// How long the app may sit in the background before it re-locks. Short enough
// that a phone left on a table is covered, long enough that the camera
// round-trip from logging a task doesn't ask for the PIN on the way back.
const RELOCK_AFTER_MS = 5 * 60 * 1000;

function readUnlockedAt(): number {
  try {
    return Number(window.sessionStorage.getItem(UNLOCKED_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * The owner's screen lock over the dashboard (Phase 87).
 *
 * The PIN is no longer how anyone gets *in* — Google sign-in is, and the
 * middleware enforces it before this component ever renders. What is left for
 * the PIN is the thing it was actually good at: keeping the household's data
 * off the screen when the owner's unlocked phone is in someone else's hands.
 * So it is deliberately local — compared in the browser against the value in
 * HouseholdContext, with no bearing on the Supabase session.
 *
 * The content stays mounted and blurred behind the pad rather than being
 * unmounted: the dashboard is expensive to build, and re-mounting it on every
 * unlock would re-fetch the whole household.
 */
export function OwnerAppLock({ children }: { children: ReactNode }) {
  const { unlockOwner, roleHydrated } = useHousehold();
  // Starts locked, and stays that way through the first paint even for a
  // session that is already unlocked — reading sessionStorage during render
  // would make the server HTML and the client's first render disagree.
  const [locked, setLocked] = useState(true);
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const unlockedAt = readUnlockedAt();
    if (unlockedAt && Date.now() - unlockedAt < RELOCK_AFTER_MS) {
      // Already unlocked in this tab, and recently enough: re-entering the
      // PIN to come back from a photo would be theatre, not security.
      setLocked(false);
    }
  }, []);

  // Re-locks after a spell in the background. Measured from when the app was
  // hidden rather than on a timer, so a phone in a pocket for an hour is
  // locked the moment it is looked at again.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (away > RELOCK_AFTER_MS) setLocked(true);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const unlock = useCallback(() => {
    setLocked(false);
    setPin("");
    try {
      window.sessionStorage.setItem(UNLOCKED_KEY, String(Date.now()));
    } catch {
      // Blocked storage: this tab is unlocked, a reload asks again.
    }
  }, []);

  function pressDigit(digit: string) {
    if (shake || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length < PIN_LENGTH) return;

    // unlockOwner also flips the app into owner mode, which is what the
    // owner-only screens read (useRequireOwner) — one gesture, not two.
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
          tab press can't reach the blurred dashboard behind the pad. */}
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
              {roleHydrated
                ? "Enter your 4-digit PIN to unlock the dashboard."
                : "Restoring your session…"}
            </p>

            <div className="mt-6 w-full">
              <PinPad
                pin={pin}
                shake={shake}
                onDigit={pressDigit}
                onBackspace={() => setPin((p) => p.slice(0, -1))}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
