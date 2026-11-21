"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  LaunchStage,
  MiamusMark,
  MiamusPromise,
  PROMISE,
  RumahRules,
  useLaunchClock,
} from "@/components/brand/loading-screens";
import { LAUNCH_MARK_SIZE } from "@/components/brand/launch-mark-size";
import { startHandOver } from "@/lib/launch-clock";
import { readCachedOwnerLocale } from "@/lib/owner-locale";
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
 * The branded covers: the Miamus mark for owners, the RUMAH rules
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
  return <CoverFace variant={variant} revealing={phase === "revealing"} opening />;
}

/**
 * When the staff launch cover trades the mark for the RUMAH rules, in ms on
 * the launch clock (20 Nov). 1500: only on a slow load, like the owner's
 * promise line, so a quick launch shows the mark alone instead of five rules
 * that are gone before they can be read (the manager's recommendation; the
 * owner's choice is pending). 0: the rules as soon as the staff cover takes
 * over, as before.
 */
export const STAFF_RULES_AFTER_MS = 1500;

const STAFF_HAND_OVER = ["staff-mark-out", "staff-rules-in"];

/**
 * The cover itself: the launch stage (loading-screens.tsx), above everything
 * but sheets and dialogs. Fades out over 200ms, opacity only, letting taps
 * through while it does. `fadeIn` for a cover that appears over a screen
 * already in use, where popping in at full opacity would itself be the jolt.
 *
 * `opening` for the launch cover: the big mark, on the launch clock, so it
 * carries on from the "/" splash it replaces without a jump (the promise line
 * keeps that clock too). Without it, a navigation cover: the mark at 88px.
 * Big only where the phone has just shown the icon (Fable's look, 20 Nov).
 */
function CoverFace({
  variant,
  revealing,
  fadeIn = false,
  opening = false,
}: {
  variant: CoverVariant;
  revealing: boolean;
  fadeIn?: boolean;
  opening?: boolean;
}) {
  return (
    <LaunchStage
      className={cn(
        revealing
          ? "pointer-events-none opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none"
          : "opacity-100",
        fadeIn && !revealing && "animate-view-fade motion-reduce:animate-none"
      )}
    >
      {variant === "owner" ? (
        <OwnerFace opening={opening} />
      ) : opening ? (
        <StaffLaunchFace />
      ) : (
        <RumahRules />
      )}
    </LaunchStage>
  );
}

/** The owner's cover: the mark, and the promise line under it. */
function OwnerFace({ opening }: { opening: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLaunchClock(ref, opening);
  return (
    <div ref={ref} className="relative">
      <MiamusMark opening={opening} size={opening ? LAUNCH_MARK_SIZE : 88} />
      <OwnerPromise />
    </div>
  );
}

/**
 * The staff launch cover (20 Nov, Fable's look). It opens on the launch mark,
 * the same one the "/" splash was showing and on the same clock, so the
 * hand-over from the splash is unseen. At STAFF_RULES_AFTER_MS the mark fades
 * out over 200ms and the RUMAH rules fade in from 120ms later: nothing leaves
 * in one frame. Both in one grid cell, so each stays on the screen's centre.
 * Fades stay under reduced motion: they are opacity, and without them the two
 * would sit on top of each other.
 */
function StaffLaunchFace() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) startHandOver(ref.current, STAFF_HAND_OVER, STAFF_RULES_AFTER_MS);
  }, []);
  return (
    <div ref={ref} className="grid place-items-center">
      <div
        className="col-start-1 row-start-1 animate-staff-mark-out"
        style={{ animationDelay: `${STAFF_RULES_AFTER_MS}ms` }}
      >
        <MiamusMark opening />
      </div>
      <RumahRules
        className="col-start-1 row-start-1 animate-staff-rules-in"
        style={{ animationDelay: `${STAFF_RULES_AFTER_MS + 120}ms` }}
      />
    </div>
  );
}

/**
 * The philosophy line on the owner's cover, in this phone's owner language.
 * Read after mount: the server render has no storage, and the line is still
 * invisible for its first 1.5s, so it never visibly changes language.
 */
function OwnerPromise() {
  const [text, setText] = useState<string>(PROMISE.en);
  useEffect(() => {
    if (readCachedOwnerLocale() === "id") setText(PROMISE.id);
  }, []);
  return <MiamusPromise text={text} />;
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
