"use client";

import { MiamusMark, RumahRules } from "@/components/brand/loading-screens";
import { useTabTransitionPhase } from "@/lib/tab-transition";
import { cn } from "@/lib/utils";

/**
 * The branded cover over a tab switch (Phase 122) — see lib/tab-transition.
 *
 * Fixed to the app column (max-w-md, centred, as the mobile frame is), at
 * z-[25]: above the content, below the sticky header (z-30) and the bottom
 * tab bar (z-40). Both bars stay visible over it, because they are where the
 * new tab's highlight appears — the owner's tabs at the bottom, the staff
 * view's pills in the header — and that has to show on the tap itself.
 *
 * Appears at full opacity with no transition, fades out over 200ms. Opacity
 * is the only thing that animates. Lets taps through while fading, so the
 * next tap is never swallowed by a cover that is already leaving.
 *
 * Outside PullToRefresh in both layouts: its content wrapper carries a
 * transform, which would pin a `fixed` child to it instead of the viewport.
 */
export function TabTransitionOverlay({ variant }: { variant: "owner" | "staff" }) {
  const phase = useTabTransitionPhase();
  if (phase === "idle") return null;

  return (
    <div
      aria-hidden
      className={cn(
        "fixed inset-y-0 left-1/2 z-[25] flex w-full max-w-md -translate-x-1/2 items-center justify-center bg-slate-50 px-6",
        phase === "revealing"
          ? "pointer-events-none opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none"
          : "opacity-100"
      )}
    >
      {variant === "owner" ? <MiamusMark /> : <RumahRules />}
    </div>
  );
}
