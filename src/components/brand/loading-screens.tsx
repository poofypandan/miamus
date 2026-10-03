"use client";

import { BrandMark } from "@/components/brand/brand-mark";
import { RUMAH } from "@/components/staff/staff-splash";
import { useHouseholdName } from "@/hooks/use-household-name";

/**
 * What a screen shows while its route or its session is still resolving
 * (Phase 121): app/dashboard/loading.tsx and app/staff/loading.tsx, and the
 * gates that used to render nothing at all in the same moment.
 *
 * Animations are transform (the ring) and opacity (the fade-in, the pulse)
 * only, so they run on the compositor and cannot drop frames while the page
 * underneath is busy rendering — which, during a load, it is.
 */

/** Owner-facing: the Miamus mark inside a spinning ring. */
export function OwnerLoadingScreen() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-[60vh] flex-1 animate-loader-in items-center justify-center motion-reduce:animate-none"
    >
      <div className="relative flex size-24 items-center justify-center">
        {/* A full faint track, and a quarter of it darker that spins: the
            rotation is a transform on its own layer, the mark never moves. */}
        <span aria-hidden className="absolute inset-0 rounded-full border-2 border-zinc-200" />
        <span
          aria-hidden
          className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-zinc-900 will-change-transform motion-reduce:animate-none"
        />
        <BrandMark size={56} rounded />
      </div>
    </div>
  );
}

/**
 * Staff-facing: the household's name over the RUMAH house rules — the layout
 * of the old landing page — breathing gently while the list loads.
 */
export function StaffLoadingScreen() {
  // The household this phone was invited to, or "Miamus" before it is bound.
  const householdName = useHouseholdName();
  return (
    <div
      role="status"
      aria-label="Memuat"
      className="flex min-h-screen flex-1 animate-loader-in flex-col items-center justify-center px-6 text-center select-none motion-reduce:animate-none"
    >
      <div className="flex animate-loader-pulse flex-col items-center gap-8 motion-reduce:animate-none">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{householdName}</h1>
        <div className="flex w-fit flex-col items-start space-y-2 text-left text-base">
          {RUMAH.map((r) => (
            <div key={r.letter}>
              <span className="font-bold text-gray-900">{r.letter}</span>
              <span className="font-normal text-gray-500">{r.rest}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
