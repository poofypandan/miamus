/**
 * The owner dashboard's five tabs (Phase 100).
 *
 * Flattened from the old three-modules-plus-sub-tabs arrangement, where the
 * day's work was two levels deep: Pets > Daily Feed for the dogs, Household >
 * Chores for the house, and no screen that showed both. Agenda is that screen,
 * and it sits in the middle because it is the one people open the app for.
 *
 * The order here is the order on the bar, so Agenda's position is load-bearing
 * rather than incidental.
 */
export const DASHBOARD_MODULES = ["pets", "chores", "agenda", "inventory", "access"] as const;
export type DashboardModule = (typeof DASHBOARD_MODULES)[number];

export const DEFAULT_MODULE: DashboardModule = "agenda";

/**
 * Query-param values from before this phase, kept working.
 *
 * These are in live history entries, in the PWA's saved state, and in the
 * "← Owner Dashboard" link on every staff phone. "household" opened on its
 * Chores panel by default, so that is where it still lands; "staff" was
 * relabelled Access in Phase 96 without the param ever changing.
 */
const LEGACY_MODULES: Record<string, DashboardModule> = {
  household: "chores",
  staff: "access",
};

export function moduleFromParam(value: string | null): DashboardModule {
  if (DASHBOARD_MODULES.includes(value as DashboardModule)) return value as DashboardModule;
  return (value && LEGACY_MODULES[value]) || DEFAULT_MODULE;
}

export function moduleHref(module: DashboardModule): string {
  // Agenda is the default, so it gets the bare path: the dashboard's own URL
  // should be the screen it opens on, not a redirect to one.
  return module === DEFAULT_MODULE ? "/dashboard" : `/dashboard?module=${module}`;
}
