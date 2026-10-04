"use client";

import { useEffect, useState } from "react";
import { MiamusMark, RumahRules } from "@/components/brand/loading-screens";
import { COVER_FADE_MS, useTabTransitionPhase, waitForStableLayout } from "@/lib/tab-transition";
import { cn } from "@/lib/utils";

/**
 * The branded covers (Phases 122–123): one picture over every moment the app
 * is assembling itself — a cold start, a tab switch — so none of it is seen.
 *
 * Owner: the circular Miamus mark in its ring. Staff: the RUMAH house rules.
 * On the app's own background, fixed to the app column (max-w-md, centred,
 * as the mobile frame is). Appears at full opacity with no fade in; fades out
 * over 200ms. Opacity is the only thing that animates, and taps pass through
 * while it does, so the next tap is never swallowed by a cover on its way out.
 *
 * THE LAYERS (Phase 123 audit — keep this ladder in step):
 *   z-20  the staff "Lapor" button       (was z-50, and showed through)
 *   z-25  tab cover                      over content and floating buttons
 *   z-30  sticky header                  its pills light up on the tap
 *   z-40  bottom tab bar                 its tabs light up on the tap
 *   z-45  launch cover                   over everything, bars included
 *   z-50  sheets, dialogs, toasts        opened deliberately, always on top
 *
 * Both layouts render these outside PullToRefresh, whose content wrapper
 * carries a transform that would pin a `fixed` child to it.
 */
export function BrandCover({
  variant,
  revealing,
  className,
}: {
  variant: "owner" | "staff";
  revealing: boolean;
  className: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "fixed inset-y-0 left-1/2 flex w-full max-w-md -translate-x-1/2 items-center justify-center bg-slate-50 px-6",
        revealing
          ? "pointer-events-none opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none"
          : "opacity-100",
        className
      )}
    >
      {variant === "owner" ? <MiamusMark /> : <RumahRules />}
    </div>
  );
}

/** Over a tab switch — see lib/tab-transition. Below both bars. */
export function TabTransitionOverlay({ variant }: { variant: "owner" | "staff" }) {
  const phase = useTabTransitionPhase();
  if (phase === "idle") return null;
  return <BrandCover variant={variant} revealing={phase === "revealing"} className="z-[25]" />;
}

/**
 * Has a launch cover already lifted in this page session? Then a layout that
 * mounts again later — an owner going to the staff view and back — opens
 * straight onto its content, with no logo flashing up over data already held.
 * Module state, so it resets exactly when the app is launched afresh.
 */
let launched = false;

/**
 * Generous on purpose: past this, the household data has not arrived and
 * may not (no network, no cached snapshot). The app's own loading and error
 * states say more than a logo would, so the cover gets out of their way.
 */
const LAUNCH_MAX_WAIT_MS = 6000;

/**
 * Over a cold start (Phase 123), bars and all.
 *
 * In the server-rendered HTML — useState's initial value — so it is on screen
 * before any JavaScript runs, rather than after a blank first paint. Lifts
 * once `ready` (the household's data is in) and the page has stopped moving
 * underneath it.
 */
export function LaunchCover({ variant, ready }: { variant: "owner" | "staff"; ready: boolean }) {
  const [phase, setPhase] = useState<"covering" | "revealing" | "done">(() =>
    launched ? "done" : "covering"
  );
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (phase !== "covering") return;
    const timer = setTimeout(() => setTimedOut(true), LAUNCH_MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "covering" || !(ready || timedOut)) return;
    let current = true;
    void waitForStableLayout({ minMs: 0, maxMs: 1500, isCurrent: () => current }).then(() => {
      if (!current) return;
      launched = true;
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
  return <BrandCover variant={variant} revealing={phase === "revealing"} className="z-[45]" />;
}
