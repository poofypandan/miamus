"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

  return (
    <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-lg font-semibold">Banyuwangi 11</span>
        <Link
          href="/staff"
          className="flex min-h-[48px] items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Open Staff View →
        </Link>
      </div>

      {/* Staff only ever has the Daily Feed tab — a single-item tab row is
          pure clutter, so skip it entirely rather than rendering it. A tap is
          a .push() so Back returns to the previous panel, as the links these
          replaced did; swipes use .replace() (see SwipeCarousel callers). */}
      {isOwner && activeModule === "pets" && (
        <div className="px-4 pb-3">
          <SegmentedControl
            ariaLabel="Pets view"
            segments={PETS_SEGMENTS}
            value={activeTab}
            onChange={(tab) => router.push(tabHref(tab), { scroll: false })}
          />
        </div>
      )}
      {isOwner && activeModule === "household" && (
        <div className="px-4 pb-3">
          <SegmentedControl
            ariaLabel="Household view"
            segments={HOUSEHOLD_SEGMENTS}
            value={activeHouseholdView}
            onChange={(view) => router.push(householdViewHref(view), { scroll: false })}
          />
        </div>
      )}
    </div>
  );
}
