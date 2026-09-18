"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateRibbon } from "@/components/date-ribbon";
import { DailyFeedTab } from "@/components/dashboard/tabs/daily-feed-tab";
import { SchedulesTab } from "@/components/dashboard/tabs/schedules-tab";
import { HouseholdTab } from "@/components/dashboard/tabs/household-tab";
import { StaffTab } from "@/components/dashboard/tabs/staff-tab";
import { PetProfileSheet } from "@/components/dashboard/pet-profile-sheet";
import { SwipeCarousel } from "@/components/shared/swipe-carousel";
import { useHousehold } from "@/context/household-context";
import {
  DASHBOARD_TABS,
  HOUSEHOLD_VIEWS,
  householdViewHref,
  householdViewIndex,
  tabHref,
  tabIndex,
} from "@/lib/dashboard-tabs";
import { moduleFromParam } from "@/lib/dashboard-modules";

export default function DashboardPage() {
  // useSearchParams() opts this subtree out of static rendering unless it's
  // behind a Suspense boundary — the rest of the page has no static content
  // to show in the meantime anyway, so a null fallback is fine.
  return (
    <Suspense fallback={null}>
      <DashboardCanvas />
    </Suspense>
  );
}

function DashboardCanvas() {
  const router = useRouter();
  const { selectedDate, setSelectedDate } = useHousehold();
  const searchParams = useSearchParams();
  const activeModule = moduleFromParam(searchParams.get("module"));

  // A swipe updates the carousel's own position instantly, then brings the URL
  // along as a .replace() — not .push(), so swiping back and forth doesn't pile
  // up history entries. TopNav's pills read the same URL, so they follow.
  function changeTab(index: number) {
    router.replace(tabHref(DASHBOARD_TABS[index]), { scroll: false });
  }

  function changeHouseholdView(index: number) {
    router.replace(householdViewHref(HOUSEHOLD_VIEWS[index]), { scroll: false });
  }

  if (activeModule === "household") {
    return (
      <HouseholdTab
        viewIndex={householdViewIndex(searchParams.get("view"))}
        onViewChange={changeHouseholdView}
      />
    );
  }
  // Staff is a single screen with nothing to swipe between.
  if (activeModule === "staff") {
    return (
      <div className="px-4 pb-6">
        <StaffTab />
      </div>
    );
  }

  return (
    <>
      {/* Outside the carousel on purpose: the ribbon is shared by both tabs, so
          letting it ride the swipeable track meant two copies sliding past each
          other mid-swipe. Anchored here it stays perfectly still while the
          panels move beneath it, and there is only ever one of it. */}
      <div className="px-4">
        <DateRibbon value={selectedDate} onChange={setSelectedDate} locale="en" />
      </div>

      <SwipeCarousel index={tabIndex(searchParams.get("tab"))} onIndexChange={changeTab}>
        <DailyFeedTab />
        <SchedulesTab />
      </SwipeCarousel>
      <PetProfileSheet />
    </>
  );
}
