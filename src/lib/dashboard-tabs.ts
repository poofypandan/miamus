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
