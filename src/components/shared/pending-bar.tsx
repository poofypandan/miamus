"use client";

import { cn } from "@/lib/utils";

/**
 * A thin bar across the top edge while a view is on its way (Phase 125).
 *
 * The only feedback a slow tab switch gets: the current view stays on screen
 * and usable, and this says something is coming. It stays invisible for its
 * first 150ms (animate-loader-in's delay), so a switch from cached data —
 * nearly all of them — never shows it at all.
 *
 * Fixed to the app column, above the sticky header (z-35) and below sheets.
 * The sliding segment is a transform; the fade is opacity. Nothing else moves.
 */
export function PendingBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className="pointer-events-none fixed top-0 left-1/2 z-[35] h-0.5 w-full max-w-md -translate-x-1/2 animate-loader-in overflow-hidden motion-reduce:animate-none"
    >
      <div
        className={cn(
          "h-full w-2/5 animate-pending-slide bg-zinc-900/70 will-change-transform",
          "motion-reduce:w-full motion-reduce:animate-none"
        )}
      />
    </div>
  );
}
