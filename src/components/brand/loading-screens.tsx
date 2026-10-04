"use client";

import { BrandMark } from "@/components/brand/brand-mark";
import { hasLaunched } from "@/lib/launch-state";
import { RUMAH } from "@/components/staff/staff-splash";
import { cn } from "@/lib/utils";

/**
 * The branded pictures (Phases 121–125): the circular Miamus mark and the
 * RUMAH rules. Drawn by the launch cover (brand-cover.tsx), the "/" splash,
 * and the two loaders below, which fill the gates' first moment while a
 * session resolves.
 *
 * Launch only (Phase 125): once the launch cover has lifted, the loaders
 * render nothing for the rest of the session. A gate that remounts later —
 * an owner opening the staff view — resolves within a frame, and a logo
 * there would be a flash of the splash in the middle of using the app.
 *
 * Animations are transform (the ring) and opacity (the fade-in, the pulse)
 * only, so they run on the compositor and cannot drop frames while the page
 * underneath is busy rendering — which, during a load, it is.
 */

/**
 * The Miamus mark as a circle, inside a spinning ring (Phase 123).
 *
 * The tile BrandMark draws is clipped round rather than redrawn: its glyph
 * sits well inside the inscribed circle, so the clip takes only empty ink.
 * The ring is two layers — a faint full track, and a darker quarter that
 * rotates. Rotation is a transform on its own layer; the mark never moves.
 */
export function MiamusMark() {
  return (
    <div className="relative flex size-24 items-center justify-center">
      <span aria-hidden className="absolute inset-0 rounded-full border-2 border-zinc-200" />
      <span
        aria-hidden
        className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-zinc-900 will-change-transform motion-reduce:animate-none"
      />
      <div className="size-[72px] overflow-hidden rounded-full">
        <BrandMark size={72} rounded={false} />
      </div>
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
      <div className="flex w-fit flex-col items-start space-y-2 text-left text-base">
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

/** Owner-facing: the Miamus mark inside a spinning ring. */
export function OwnerLoadingScreen() {
  if (hasLaunched()) return null;
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-[60vh] flex-1 animate-loader-in items-center justify-center motion-reduce:animate-none"
    >
      <MiamusMark />
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
