"use client";

import { useEffect, useState } from "react";
import { MiamusMark, RumahRules } from "@/components/brand/loading-screens";
import {
  endNavigation,
  hasLaunched,
  markLaunched,
  pendingNavigation,
  usePendingNavigation,
  type CoverVariant,
} from "@/lib/launch-state";
import { waitForStableLayout } from "@/lib/stable-layout";
import { cn } from "@/lib/utils";

/**
 * The branded covers: the circular Miamus mark for owners, the RUMAH rules
 * for staff. Two of them:
 *
 *   LaunchCover      Over a cold start, at once, until the page is ready
 *                    (Phases 123, 125).
 *   NavigationCover  Over a navigation — a tab, or a switch between the
 *                    owner and staff views — but only one that is genuinely
 *                    slow (Phase 134). See SHOW_AFTER_MS.
 *
 * Phases 122–124 drew a cover over every tab switch, and a switch from cached
 * data flashed a logo for a tenth of a second; Phase 125 took them out, and
 * Phase 132 drew one over every role switch, fast or not. Phase 134's rule is
 * the one in between: the current screen stays put while the next one loads
 * (a React transition — hooks/use-tab-navigation — or Next's own for a route
 * change), and the cover appears only if that is still going on after a
 * beat. Whichever side the navigation is heading for picks the picture.
 *
 * THE LAYERS (keep this ladder in step):
 *   z-20  the staff "Lapor" button
 *   z-30  sticky header
 *   z-35  pending bar                     a switch's first sign
 *   z-40  bottom tab bar
 *   z-45  launch / navigation cover       over everything, bars included
 *   z-50  sheets, dialogs, toasts         opened deliberately, always on top
 */

/** Matches the cover's duration-200. */
const COVER_FADE_MS = 200;

/**
 * Generous on purpose: past this, the household data has not arrived and
 * may not (no network, no cached snapshot). The app's own loading and error
 * states say more than a logo would, so the cover gets out of their way.
 */
const LAUNCH_MAX_WAIT_MS = 6000;

/**
 * How long a navigation runs before it is covered (Phase 134). A cached tab
 * commits and settles in a few frames, well inside this, and never shows a
 * cover; React itself waits about as long before revealing a suspended
 * boundary, for the same reason. The pending bar (from 150ms) is the sign in
 * between.
 */
const SHOW_AFTER_MS = 400;

/**
 * Once up, the cover stays at least this long. A cover that appears and is
 * gone 50ms later is exactly the flash this is here to prevent.
 */
const MIN_VISIBLE_MS = 500;

/** A navigation that never lands — a failed request — is abandoned here. */
const NAVIGATION_GIVE_UP_MS = 6000;

/**
 * Over a cold start, bars and all.
 *
 * In the server-rendered HTML — useState's initial value — so it is on screen
 * before any JavaScript runs. Lifts once `ready` and the page has stopped
 * moving underneath it. Callers fold the household's name into `ready`
 * (Phase 125), so the header is never seen changing from "Miamus" to the
 * real name: by the time the cover goes, the name is already there.
 *
 * Also where a role switch ends (Phases 132, 134): mounted by the
 * destination view, it knows when that view is ready, and only then lets
 * the switch go. Whether a cover is up meanwhile is NavigationCover's call.
 */
export function LaunchCover({ variant, ready }: { variant: CoverVariant; ready: boolean }) {
  const [phase, setPhase] = useState<"covering" | "revealing" | "done">(() =>
    hasLaunched() ? "done" : "covering"
  );

  // The role switch this view is the destination of, if it was mounted by one.
  const [arrival] = useState(() => {
    const nav = pendingNavigation();
    return nav?.kind === "switch" && nav.variant === variant ? nav.id : null;
  });

  useEffect(() => {
    if (arrival === null || !ready) return;
    let current = true;
    void waitForStableLayout(1500, () => current).then(() => {
      if (current) endNavigation(arrival);
    });
    return () => {
      current = false;
    };
  }, [arrival, ready]);

  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (phase !== "covering") return;
    const timer = setTimeout(() => setTimedOut(true), LAUNCH_MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "covering" || !(ready || timedOut)) return;
    let current = true;
    void waitForStableLayout(1500, () => current).then(() => {
      if (!current) return;
      markLaunched();
      setPhase("revealing");
    });
    return () => {
      current = false;
    };
  }, [phase, ready, timedOut]);

  useEffect(() => {
    if (phase !== "revealing") return;
    const timer = setTimeout(() => setPhase("done"), COVER_FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "done") return null;
  return <CoverFace variant={variant} revealing={phase === "revealing"} />;
}

/**
 * The cover itself: fixed to the app column above everything but sheets and
 * dialogs. Fades out over 200ms, opacity only, letting taps through while it
 * does. `fadeIn` for a cover that appears over a screen already in use, where
 * popping in at full opacity would itself be the jolt.
 */
function CoverFace({
  variant,
  revealing,
  fadeIn = false,
}: {
  variant: CoverVariant;
  revealing: boolean;
  fadeIn?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "fixed inset-y-0 left-1/2 z-[45] flex w-full max-w-md -translate-x-1/2 items-center justify-center bg-slate-50 px-6",
        revealing
          ? "pointer-events-none opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none"
          : "opacity-100",
        fadeIn && !revealing && "animate-view-fade motion-reduce:animate-none"
      )}
    >
      {variant === "owner" ? <MiamusMark /> : <RumahRules />}
    </div>
  );
}

/**
 * The cover over a slow navigation (Phase 134). Mounted once, in the root
 * layout, so it lives through a role switch's route change.
 *
 *   - Nothing for the first SHOW_AFTER_MS of a navigation. Most end in that
 *     window and are never covered.
 *   - Still running then: the destination's picture fades in, and stays until
 *     the navigation ends — and for at least MIN_VISIBLE_MS.
 *   - Then it fades out, the new screen already settled beneath it.
 */
export function NavigationCover() {
  const nav = usePendingNavigation();
  const [shown, setShown] = useState<{ variant: CoverVariant; at: number } | null>(null);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (!nav) return;
    const timer = setTimeout(() => endNavigation(nav.id), NAVIGATION_GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [nav]);

  // Up once the navigation has run SHOW_AFTER_MS — counted from the tap, so
  // a tap that supersedes another does not restart a wait already served.
  useEffect(() => {
    if (!nav || shown) return;
    const wait = Math.max(0, SHOW_AFTER_MS - (performance.now() - nav.startedAt));
    const timer = setTimeout(() => {
      setRevealing(false);
      setShown({ variant: nav.variant, at: performance.now() });
    }, wait);
    return () => clearTimeout(timer);
  }, [nav, shown]);

  // Down once it has ended, no sooner than MIN_VISIBLE_MS after it went up.
  useEffect(() => {
    if (nav || !shown) return;
    const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - shown.at));
    const fade = setTimeout(() => setRevealing(true), wait);
    const gone = setTimeout(() => {
      setShown(null);
      setRevealing(false);
    }, wait + COVER_FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [nav, shown]);

  if (!shown) return null;
  return (
    <CoverFace
      // A new navigation while it is up shows where that one is going.
      variant={nav?.variant ?? shown.variant}
      // ...and catches a cover that had begun to fade.
      revealing={revealing && !nav}
      fadeIn
    />
  );
}
