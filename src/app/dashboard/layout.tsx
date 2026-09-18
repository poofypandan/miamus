"use client";

import { useEffect, type ReactNode } from "react";
import { Suspense } from "react";
import { TopNav } from "@/components/dashboard/top-nav";
import { BottomTabBar } from "@/components/navigation/bottom-tab-bar";
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
    // The bottom padding is the fixed tab bar's footprint — its h-16 plus the
    // safe-area inset it pads itself with — so the last card of any feed
    // scrolls clear of it. Keep in step with bottom-tab-bar.tsx.
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 pb-[calc(4rem+env(safe-area-inset-bottom))]">
      {/* TopNav reads the active tab via useSearchParams(), which requires a
          Suspense boundary. */}
      <Suspense fallback={null}>
        <TopNav />
      </Suspense>
      {/* Everything below the sticky nav pulls, so the gesture works from the
          banners as well as the feed. TopNav stays put and the content slides
          under it. Silent, because the pull's own spinner is the feedback —
          skeletons mid-gesture would be worse than none. */}
      <PullToRefresh
        onRefresh={() => refresh({ silent: true })}
        className="flex flex-1 flex-col"
        contentClassName="flex flex-1 flex-col"
      >
        <InventoryAlertBanner />
        {/* Sits outside <main> so the one-time hint stays put above the
            swipeable carousel rather than scrolling with a single tab. */}
        <StaffOnboardingBanner />
        {/* pt-3, not pt-6 — this padding sits outside the carousel's clipping
            box, so trimming it is free of shadow-clipping risk and is where
            most of the old 40px gap under the tabs came from. No bottom
            padding: it sat outside the swipe area too, leaving a 24px strip
            that ignored swipes. The carousel's own pb-4 is the gap above the
            tab bar now, and it is swipeable (Phase 84).

            A flex column all the way down, so the swipe carousel can grow to
            the tab bar: the empty space under a short panel is still somewhere
            a swipe can start (Phase 83E). */}
        <main className="relative flex flex-1 flex-col overflow-x-hidden pt-3">{children}</main>
      </PullToRefresh>

      {/* Outside PullToRefresh on purpose — see BottomTabBar. It reads the
          active module via useSearchParams(), so it needs Suspense too. */}
      <Suspense fallback={null}>
        <BottomTabBar />
      </Suspense>
    </div>
  );
}
