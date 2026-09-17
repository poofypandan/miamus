"use client";

import { useEffect, type ReactNode } from "react";
import { Suspense } from "react";
import { TopNav } from "@/components/dashboard/top-nav";
import { InventoryAlertBanner } from "@/components/dashboard/inventory-alert-banner";
import { StaffOnboardingBanner } from "@/components/dashboard/staff-onboarding-banner";
import { PullToRefresh } from "@/components/shared/pull-to-refresh";
import { useHousehold } from "@/context/household-context";
import { useOfflineSync } from "@/hooks/use-offline-sync";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  // Runs once on mount only — the mobile virtual keyboard (from the PIN
  // entry that got the owner here) can still be collapsing when this layout
  // first mounts, leaving the page scrolled from its perspective. The delay
  // lets that collapse finish before we measure/reset scroll position.
  useEffect(() => {
    const timer = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useOfflineSync();
  const { refresh } = useHousehold();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 pb-safe">
      {/* TopNav reads the active tab via useSearchParams(), which requires a
          Suspense boundary. */}
      <Suspense fallback={null}>
        <TopNav />
      </Suspense>
      {/* Everything below the sticky nav pulls, so the gesture works from the
          banners as well as the feed. TopNav stays put and the content slides
          under it. Silent, because the pull's own spinner is the feedback —
          skeletons mid-gesture would be worse than none. */}
      <PullToRefresh onRefresh={() => refresh({ silent: true })} className="flex flex-1 flex-col">
        <InventoryAlertBanner />
        {/* Sits outside <main> so the one-time hint stays put above the
            swipeable carousel rather than scrolling with a single tab. */}
        <StaffOnboardingBanner />
        {/* pt-3/pb-6, not py-6 — this padding sits outside the carousel's
            clipping box, so trimming the top is free of shadow-clipping risk and
            is where most of the old 40px gap under the tabs came from. */}
        <main className="relative flex-1 overflow-x-hidden pt-3 pb-6">{children}</main>
      </PullToRefresh>
    </div>
  );
}
