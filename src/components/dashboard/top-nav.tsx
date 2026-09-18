"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader, HeaderNavLink } from "@/components/navigation/app-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DASHBOARD_TABS,
  HOUSEHOLD_VIEWS,
  householdViewHref,
  householdViewIndex,
  tabHref,
  tabIndex,
  type DashboardTab,
  type HouseholdView,
} from "@/lib/dashboard-tabs";
import { moduleFromParam } from "@/lib/dashboard-modules";
import { useHousehold } from "@/context/household-context";

const PETS_SEGMENTS: { value: DashboardTab; label: string }[] = [
  { value: "feed", label: "Daily Feed" },
  { value: "schedules", label: "Schedule" },
];

const HOUSEHOLD_SEGMENTS: { value: HouseholdView; label: string }[] = [
  { value: "chores", label: "Chores" },
  { value: "inventory", label: "Inventory" },
];

/**
 * The dashboard header: the property name, the way into the staff view, and —
 * for modules with two panels — the sub-view pills. Switching between modules
 * moved to the BottomTabBar in Phase 84, where a thumb can reach it; the
 * sub-view pills stay up here because they belong to the content directly
 * beneath them.
 */
export function TopNav() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Both sub-navs read the same URL params the page renders its carousel
  // from, so the highlighted pill and the panel on screen are one value.
  const activeTab = DASHBOARD_TABS[tabIndex(searchParams.get("tab"))];
  const activeHouseholdView = HOUSEHOLD_VIEWS[householdViewIndex(searchParams.get("view"))];
  const activeModule = moduleFromParam(searchParams.get("module"));
  const { userRole } = useHousehold();
  const isOwner = userRole === "owner";

  // Staff only ever has the Daily Feed tab — a single-item tab row is pure
  // clutter, so no sub-nav at all for them. A tap is a .push() so Back returns
  // to the previous panel; swipes use .replace() (see SwipeCarousel callers).
  let subNav = null;
  if (isOwner && activeModule === "pets") {
    subNav = (
      <SegmentedControl
        ariaLabel="Pets view"
        segments={PETS_SEGMENTS}
        value={activeTab}
        onChange={(tab) => router.push(tabHref(tab), { scroll: false })}
      />
    );
  } else if (isOwner && activeModule === "household") {
    subNav = (
      <SegmentedControl
        ariaLabel="Household view"
        segments={HOUSEHOLD_SEGMENTS}
        value={activeHouseholdView}
        onChange={(view) => router.push(householdViewHref(view), { scroll: false })}
      />
    );
  }

  return (
    <AppHeader action={<HeaderNavLink href="/staff">Open Staff View →</HeaderNavLink>}>
      {subNav}
    </AppHeader>
  );
}
