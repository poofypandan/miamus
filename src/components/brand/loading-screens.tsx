"use client";

import {
  BRAND_INK,
  M_POINTS,
  MarkStroke,
  ROOF_POINTS,
  TILE_RADIUS,
} from "@/components/brand/brand-mark";
import { hasLaunched } from "@/lib/launch-state";
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
 * Animations are transform (the roof's reveal) and opacity (the roof's fade,
 * the fade-in, the pulse) only, so they run on the compositor and cannot drop
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
 */
export function MiamusPromise({ text }: { text: string }) {
  return (
    <p className="mt-6 animate-promise-in text-center text-sm text-gray-500 motion-reduce:animate-none">
      {text}
    </p>
  );
}

/**
 * The Miamus mark as the app icon's rounded square, with the roof drawing
 * itself while something loads (2026-11-09; it was a circle in a spinning
 * ring from Phase 123).
 *
 * The M stays put; the roof is its own layer. A strip of the tile's own ink
 * covers the roof and slides off to the right, so the roof appears left to
 * right over the house; it holds, fades, and the strip slides back under the
 * faded roof, ready to draw again. The cycle starts with the house whole
 * (see globals.css), so a quick load shows the plain logo. Sliding a cover (a transform) rather than
 * animating the stroke itself keeps this on the compositor (see the top of
 * this file). Its keyframes are `roof-reveal` and `roof-fade` in globals.css,
 * one 2.4s cycle shared by both.
 *
 * 88px, the same as the start screen's mark, so the picture stays put when
 * the splash hands over to it. `still` is that start-screen mark: the whole
 * house, nothing moving. Reduced motion gets the still mark everywhere.
 */
export function MiamusMark({ still = false }: { still?: boolean }) {
  const size = 88;
  return (
    <div
      aria-hidden
      className="relative size-[88px] shrink-0 overflow-hidden"
      style={{ borderRadius: size * TILE_RADIUS, background: BRAND_INK }}
    >
      <div className="absolute inset-0">
        <MarkStroke points={M_POINTS} size={size} />
      </div>
      <div className={cn("absolute inset-0", !still && "animate-roof-fade motion-reduce:animate-none")}>
        <MarkStroke points={ROOF_POINTS} size={size} />
      </div>
      {!still && (
        // The roof's band is the top 41px (its stroke ends at 40.2px; the
        // M's starts at 41.6px), so the strip never touches the M.
        <span
          className="absolute top-0 left-0 h-[41px] w-full animate-roof-reveal will-change-transform motion-reduce:hidden"
          style={{ background: BRAND_INK }}
        />
      )}
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
export function RumahRules({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center text-center select-none", className)}>
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

/** Owner-facing: the Miamus mark, its roof drawing itself. */
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
      <MiamusMark />
      <MiamusPromise text={labels.promise} />
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
