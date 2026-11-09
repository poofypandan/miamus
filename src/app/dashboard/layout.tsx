"use client";

import { useEffect, type ReactNode } from "react";
import { Suspense } from "react";
import { TopNav } from "@/components/dashboard/top-nav";
import { BottomTabBar } from "@/components/navigation/bottom-tab-bar";
import { LaunchCover } from "@/components/brand/brand-cover";
import { OwnerAppLock } from "@/components/auth/owner-app-lock";
import { HouseholdRequestsBanner } from "@/components/dashboard/household-requests-banner";
import { LanguagePrompt } from "@/components/dashboard/language-settings";
import { ConnectionNotice } from "@/components/shared/connection-notice";
import { OutboxNotice } from "@/components/shared/outbox-notice";
import { StaffOnboardingBanner } from "@/components/dashboard/staff-onboarding-banner";
import { PullToRefresh } from "@/components/shared/pull-to-refresh";
import { useHousehold } from "@/context/household-context";
import { OwnerLocaleProvider, useOwnerLocale } from "@/context/owner-locale-context";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { usePushResync } from "@/hooks/use-push-resync";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  // Outermost, so the app lock and every banner read the owner's language
  // (Phase 149).
  return (
    <OwnerLocaleProvider>
      <DashboardShell>{children}</DashboardShell>
    </OwnerLocaleProvider>
  );
}

function DashboardShell({ children }: { children: ReactNode }) {
  // Runs once on mount only — the mobile virtual keyboard (from whatever
  // input the owner left to get here) can still be collapsing when this layout
  // first mounts, leaving the page scrolled from its perspective. The delay
  // lets that collapse finish before we measure/reset scroll position.
  useEffect(() => {
    const timer = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const ownerLocale = useOwnerLocale();
  useOfflineSync(ownerLocale);
  usePushResync();
  const { refresh, loading, tenantReady, roleHydrated } = useHousehold();

  return (
    // Google sign-in is what got them to this route (see middleware); the
    // optional biometric lock keeps the household off the screen when the
    // phone is in someone else's hands (Phase 87, PIN-free since Phase 108).
    <OwnerAppLock>
      {/* No bottom padding for the tab bar any more: it is sticky inside this
          column (Phase 113) and takes up its own space, so the last card of a
          feed already ends above it. min-h-screen is what keeps the bar on the
          bottom edge when a tab is short. */}
      <div className="flex min-h-screen w-full flex-col bg-slate-50">
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
          {/* Platform admins only: new households waiting for approval
              (Phase 148). Renders nothing for everyone else. */}
          <HouseholdRequestsBanner />
          {/* A failed load, and saves still waiting on this phone, in the
              owner's language (Phases 146, 149, 161). */}
          <div className="flex flex-col gap-2 px-4 pt-3 empty:hidden">
            <ConnectionNotice locale={ownerLocale} />
            <OutboxNotice locale={ownerLocale} />
          </div>
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

        {/* Over a cold start, until the household's data and its name are in
            and the page has settled (Phases 123, 125) — so the header is never
            seen swapping "Miamus" for the real name. */}
        <LaunchCover
          variant="owner"
          ready={tenantReady && roleHydrated && !loading}
        />

        {/* Outside PullToRefresh on purpose — see BottomTabBar. It reads the
          active module via useSearchParams(), so it needs Suspense too. */}
        <Suspense fallback={null}>
          <BottomTabBar />
        </Suspense>

        {/* Once, for an owner who has never chosen (Phase 149). */}
        <LanguagePrompt />
      </div>
    </OwnerAppLock>
  );
}
