// Order the swipeable canvas and TopNav both key off — shared so the two
// can never drift out of sync.
export const DASHBOARD_TABS = ["feed", "schedules", "health"] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export function tabIndex(tab: string | null): number {
  const index = DASHBOARD_TABS.indexOf((tab ?? "feed") as DashboardTab);
  return index === -1 ? 0 : index;
}
