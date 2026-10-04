"use client";

import { useEffect, useState } from "react";
import { MiamusMark, RumahRules } from "@/components/brand/loading-screens";
import {
  endRoleSwitch,
  hasLaunched,
  markLaunched,
  pendingRoleSwitch,
  useRoleSwitch,
  type CoverVariant,
} from "@/lib/launch-state";
import { cn } from "@/lib/utils";

/**
 * The branded covers (Phases 122–132): the circular Miamus mark for owners,
 * the RUMAH rules for staff — over a cold start, and over a switch between
 * the owner and staff views (Phase 132), and nothing else.
 *
 * Phases 122–124 also drew these over every tab switch. Phase 125 took that
 * out: tab switches now run as React transitions that keep the current view
 * on screen until the next one is ready (hooks/use-tab-navigation), so there
 * is nothing left to hide. Once the launch cover has lifted, no branded
 * screen appears again in that page session — see hasLaunched().
 *
 * THE LAYERS (keep this ladder in step):
 *   z-20  the staff "Lapor" button
 *   z-30  sticky header
 *   z-35  pending bar                     a slow tab switch's only sign
 *   z-40  bottom tab bar
 *   z-45  launch cover                    over everything, bars included
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

/** Quiet frames in a row that count as "the page has settled". */
const STABLE_FRAMES = 4;

/**
 * Resolves once the page has stopped changing shape — the document's height
 * unchanged for STABLE_FRAMES frames with no skeleton on screen — or at
 * `maxMs`, so a page that never settles cannot hold the cover up forever.
 */
function waitForStableLayout(maxMs: number, isCurrent: () => boolean): Promise<void> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    let lastHeight = -1;
    let stableFrames = 0;
    const tick = () => {
      if (!isCurrent()) return resolve();
      const height = document.documentElement.scrollHeight;
      const settled = height === lastHeight && !document.querySelector('[data-slot="skeleton"]');
      stableFrames = settled ? stableFrames + 1 : 0;
      lastHeight = height;
      if (stableFrames >= STABLE_FRAMES || performance.now() - startedAt >= maxMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Over a cold start, bars and all.
 *
 * In the server-rendered HTML — useState's initial value — so it is on screen
 * before any JavaScript runs. Lifts once `ready` and the page has stopped
 * moving underneath it. Callers fold the household's name into `ready`
 * (Phase 125), so the header is never seen changing from "Miamus" to the
 * real name: by the time the cover goes, the name is already there.
 *
 * Fixed to the app column; appears at full opacity and fades out over 200ms,
 * opacity only, letting taps through while it does.
 */
export function LaunchCover({ variant, ready }: { variant: CoverVariant; ready: boolean }) {
  // Covering on a cold start — and on arrival from a role switch into this
  // view (Phase 132), taking over the cover the tap put up so the two are
  // one unbroken screen. Any other mount after launch opens straight on the
  // page.
  const [phase, setPhase] = useState<"covering" | "revealing" | "done">(() =>
    !hasLaunched() || pendingRoleSwitch() === variant ? "covering" : "done"
  );

  // The handoff: this cover is up now, so the switch's own can come down.
  useEffect(() => {
    if (pendingRoleSwitch() === variant) endRoleSwitch();
  }, [variant]);
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
 * dialogs, appearing at full opacity and fading out over 200ms, opacity only,
 * letting taps through while it does.
 */
function CoverFace({ variant, revealing }: { variant: CoverVariant; revealing: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "fixed inset-y-0 left-1/2 z-[45] flex w-full max-w-md -translate-x-1/2 items-center justify-center bg-slate-50 px-6",
        revealing
          ? "pointer-events-none opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none"
          : "opacity-100"
      )}
    >
      {variant === "owner" ? <MiamusMark /> : <RumahRules />}
    </div>
  );
}

/**
 * The cover from the tap of a role switch until the destination's own
 * LaunchCover takes it over (Phase 132). Mounted once, in the root layout.
 * If the navigation never lands — a failed request, a tap that went nowhere —
 * it gives up after SWITCH_GIVE_UP_MS rather than trapping the app behind a
 * logo.
 */
const SWITCH_GIVE_UP_MS = 5000;

export function RoleSwitchCover() {
  const target = useRoleSwitch();
  useEffect(() => {
    if (!target) return;
    const timer = setTimeout(endRoleSwitch, SWITCH_GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [target]);
  if (!target) return null;
  return <CoverFace variant={target} revealing={false} />;
}
