"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  BRAND_INK,
  M_POINTS,
  MarkStroke,
  ROOF_POINTS,
  TILE_RADIUS,
} from "@/components/brand/brand-mark";
import { hasLaunched } from "@/lib/launch-state";
import { alignToLaunchClock } from "@/lib/launch-clock";
import { LAUNCH_MARK_SIZE } from "@/components/brand/launch-mark-size";
import { RUMAH } from "@/components/staff/staff-splash";
import { cn } from "@/lib/utils";
import { useUiLabels } from "@/components/ui/ui-labels";

/**
 * The branded pictures (Phases 121–125): the Miamus mark and the RUMAH
 * rules. Drawn by the launch cover (brand-cover.tsx), the "/" splash,
 * and the two loaders below, which fill the gates' first moment while a
 * session resolves.
 *
 * Launch only (Phase 125): once the launch cover has lifted, the loaders
 * render nothing for the rest of the session. A gate that remounts later —
 * an owner opening the staff view — resolves within a frame, and a logo
 * there would be a flash of the splash in the middle of using the app.
 *
 * Animations are transform (the strokes' reveal, the opening settle) and
 * opacity (the strokes' fade, the fade-in, the pulse) only, so they run on the compositor and cannot drop
 * frames while the page underneath is busy rendering — which, during a load,
 * it is.
 */

/**
 * Miamus's philosophy in one line (owner, 2026-11-08): sharing the everyday
 * load so there is a little less to remember. Calm, and no promise that
 * everything is handled. Owner screens only; staff have the RUMAH rules.
 */
export const PROMISE = {
  en: "A little less on your mind.",
  id: "Biar pikiran sedikit lebih ringan.",
} as const;

/**
 * The line under the owner's mark while something loads. It waits 1.5s
 * before fading in (animate-promise-in): a quick load shows the logo alone,
 * and words that flash for a moment read as a glitch.
 *
 * Hung below the mark rather than stacked after it, so it takes no room in
 * the layout: the mark sits on the screen's exact centre, where the phone's
 * own splash drew the icon a moment before, with or without the line.
 */
export function MiamusPromise({ text }: { text: string }) {
  return (
    <p className="launch-promise absolute top-full left-1/2 mt-6 w-72 -translate-x-1/2 animate-promise-in text-center text-sm text-gray-500 motion-reduce:animate-none">
      {text}
    </p>
  );
}

/**
 * The Miamus mark as the app icon's rounded square, the roof and then the M
 * drawing themselves while something loads, as the mark draws itself at the
 * end of the film (20 Nov; the roof alone from 2026-11-09).
 *
 * The house is whole first and stays still for 2.2s, so a quick load shows the
 * plain logo, and a slow one shows it with the promise line before anything
 * moves. Then the strokes fade, the roof writes itself left to right, and the
 * M follows as the roof lands, in pen order: up the left wall, along the V,
 * down the right wall. It rests whole, and goes again. The film draws along
 * each line (a stroke dash); here strips of the tile's own ink slide off the
 * lines instead, inside fixed windows, because a slide is a transform and runs
 * on the compositor, which keeps it smooth while the page underneath is busy
 * loading (dashes repaint on the main thread, and would stutter just then).
 * Timings are the film's; curves and keyframes are the mark-* ones in
 * globals.css (Fable's look, 20 Nov).
 *
 * `opening` is the launch mark. On an installed Android app it is the phone's
 * splash itself, held: a black circle, the glyph at the splash's scale, and it
 * never changes shape (the home icon and the splash are circles there too).
 * iPhones and browser tabs show the rounded square, as their home icon and
 * launch screen do. globals.css decides, so the first server-rendered frame is
 * already right. Every opening mark keeps one clock (lib/launch-clock), so the
 * marks a cold start draws one after another read as one.
 *
 * `still` is the start screen's mark: the whole house, nothing moving.
 * Reduced motion gets the still mark everywhere.
 */
export function MiamusMark({
  size = LAUNCH_MARK_SIZE,
  still = false,
  opening = false,
}: {
  size?: number;
  still?: boolean;
  opening?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLaunchClock(ref, opening);

  const radius = size * TILE_RADIUS;
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("relative shrink-0 overflow-hidden", opening && "mark-opening")}
      style={{ width: size, height: size, borderRadius: radius, background: BRAND_INK }}
    >
      <div className={cn("absolute inset-0", opening && "mark-opening-glyph")}>
        <div className={cn("absolute inset-0", !still && "animate-mark-strokes motion-reduce:animate-none")}>
          <div className="absolute inset-0">
            <MarkStroke points={M_POINTS} size={size} />
          </div>
          <div className="absolute inset-0">
            <MarkStroke points={ROOF_POINTS} size={size} />
          </div>
        </div>
        {!still && (
          <div className="absolute inset-0 motion-reduce:hidden">
            {/* The roof's band is the top 46.5% (its stroke ends at 234 of 512,
                the M's starts at 242), the M's the rest, so no strip ever
                touches the other line. The roof's strip slides off it to the
                right, its soft edge leading. */}
            <span
              className="absolute top-0 left-0 h-[46.5%] w-full animate-mark-roof will-change-transform"
              style={{ background: inkStrip("90deg", 3.9) }}
            />
            {/* The M's three windows, split where the walls meet the V (176
                and 336 of 512). Each strip is 18% longer than its window, the
                soft edge in the part that starts outside it. The V's window
                laps 1px over each wall's, on top: two clips meeting on a
                fraction of a pixel let a hairline of the stroke through. */}
            <div className="absolute top-[46.5%] left-0 h-[53.5%] w-[34.4%] overflow-hidden">
              <span
                className="absolute inset-x-0 top-0 h-[118%] animate-mark-m-left will-change-transform"
                style={{ background: inkStrip("0deg", 13) }}
              />
            </div>
            <div className="absolute top-[46.5%] left-[calc(34.4%_-_1px)] h-[53.5%] w-[calc(31.2%_+_2px)] overflow-hidden">
              <span
                className="absolute inset-y-0 left-[-18%] w-[118%] animate-mark-m-v will-change-transform"
                style={{ background: inkStrip("90deg", 13) }}
              />
            </div>
            <div className="absolute top-[46.5%] left-[65.6%] h-[53.5%] w-[34.4%] overflow-hidden">
              <span
                className="absolute inset-x-0 top-[-18%] h-[118%] animate-mark-m-right will-change-transform"
                style={{ background: inkStrip("180deg", 13) }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A strip of the tile's ink with a soft leading edge, so a line is uncovered
 * the way a pen lays it down, not cut by a hard edge.
 */
function inkStrip(direction: string, softPercent: number): string {
  return `linear-gradient(${direction}, ${BRAND_INK}00 0%, ${BRAND_INK} ${softPercent}%)`;
}

/** Hangs every animation inside `ref` from the launch clock, before paint. */
export function useLaunchClock(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    if (enabled && ref.current) alignToLaunchClock(ref.current);
  }, [enabled, ref]);
}

/**
 * The full-screen stage every launch picture stands on: the "/" splash and the
 * launch and navigation covers (brand-cover.tsx). One element, so they are the
 * same pixels: fixed to the app column, warm paper like the phone's splash
 * (manifest.ts background_color), the picture on the screen's exact centre.
 */
export function LaunchStage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "launch-stage fixed inset-y-0 left-1/2 z-[45] flex w-full max-w-md -translate-x-1/2 items-center justify-center bg-background px-6",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * The RUMAH house rules, and nothing else (Phase 124).
 *
 * The household's name used to sit above them. It is in the app header
 * already, and fetching it made this the one cover that changed while it was
 * up ("Miamus", then the real name). Static now: the same pixels every time,
 * from the first server-rendered frame.
 */
export function RumahRules({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={cn("flex flex-col items-center text-center select-none", className)} style={style}>
      {/* Opened up for a screen of its own (Phase 132): larger, wider-set and
          more air between the lines, so the five rules read as a calm list
          rather than a block squeezed into the middle of the page. */}
      <div className="flex w-fit flex-col items-start space-y-3.5 text-left text-lg leading-snug tracking-wide">
        {RUMAH.map((r) => (
          <div key={r.letter}>
            <span className="font-bold text-gray-900">{r.letter}</span>
            <span className="font-normal text-gray-500">{r.rest}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Owner-facing: the Miamus mark, its roof and M drawing themselves. */
export function OwnerLoadingScreen() {
  // In the owner's language: the dashboard's OwnerLocaleProvider sets it.
  const labels = useUiLabels();
  if (hasLaunched()) return null;
  return (
    <div
      role="status"
      aria-label={labels.loading}
      className="flex min-h-[60vh] flex-1 animate-loader-in flex-col items-center justify-center motion-reduce:animate-none"
    >
      <div className="relative">
        <MiamusMark opening />
        <MiamusPromise text={labels.promise} />
      </div>
    </div>
  );
}

/** Staff-facing: the RUMAH rules, breathing gently while the list loads. */
export function StaffLoadingScreen() {
  if (hasLaunched()) return null;
  return (
    <div
      role="status"
      aria-label="Memuat"
      className="flex min-h-screen flex-1 animate-loader-in flex-col items-center justify-center px-6 motion-reduce:animate-none"
    >
      <RumahRules className="animate-loader-pulse motion-reduce:animate-none" />
    </div>
  );
}
