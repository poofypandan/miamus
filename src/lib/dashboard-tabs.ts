// Order the swipeable canvas and TopNav both key off — shared so the two
// can never drift out of sync.
// The query-param keys, not the labels — "schedules" stays as-is so links and
// back-history entries pointing at ?tab=schedules keep working; only the
// visible label became "Schedule". A stale ?tab=health falls through
// tabIndex()'s -1 guard to the feed.
export const DASHBOARD_TABS = ["feed", "schedules"] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export function tabIndex(tab: string | null): number {
  const index = DASHBOARD_TABS.indexOf((tab ?? "feed") as DashboardTab);
  return index === -1 ? 0 : index;
}

// The Household module's two swipeable panels, keyed by ?view= alongside
// ?module=household. In the URL rather than component state so the sub-nav
// pill and the panel on screen read one value and cannot disagree (Phase 83D).
export const HOUSEHOLD_VIEWS = ["chores", "inventory"] as const;
export type HouseholdView = (typeof HOUSEHOLD_VIEWS)[number];

export function householdViewIndex(view: string | null): number {
  const index = HOUSEHOLD_VIEWS.indexOf((view ?? "chores") as HouseholdView);
  return index === -1 ? 0 : index;
}

export function tabHref(tab: DashboardTab): string {
  return `/dashboard?tab=${tab}`;
}

export function householdViewHref(view: HouseholdView): string {
  return `/dashboard?module=household&view=${view}`;
}
