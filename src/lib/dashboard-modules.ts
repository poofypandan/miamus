// The top-level pills in TopNav. `pets` is the original dashboard (Daily Feed
// + Schedule carousel); the other two are single-screen modules, so they
// bypass the carousel entirely.
export const DASHBOARD_MODULES = ["pets", "household", "staff"] as const;
export type DashboardModule = (typeof DASHBOARD_MODULES)[number];

export function moduleFromParam(value: string | null): DashboardModule {
  return DASHBOARD_MODULES.includes(value as DashboardModule)
    ? (value as DashboardModule)
    : "pets";
}
