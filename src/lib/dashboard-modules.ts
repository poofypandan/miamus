/**
 * The owner dashboard's tabs (Phase 100), in bar order (Phase 111, Phase 175).
 *
 * Today anchors the left edge and Settings the right: Today is the screen
 * people open the app for, so it is the first tab and the default, and
 * Settings — members, staff, invites, the app lock — is the rarely-visited
 * end. They are the two fixed points. Between them are the areas of the home:
 * Home second, because every home has one; then Pets, the only tab a home can
 * switch off, so only Kitchen ever changes place (Phase 175 plan, section 2).
 *
 * The keys are the URL's ?module= values and never change; only labels,
 * icons and this order do (bottom-tab-bar.tsx has the labels). To reorder the
 * bar, reorder this one line.
 */
export const DASHBOARD_MODULES = ["agenda", "chores", "pets", "inventory", "access"] as const;
export type DashboardModule = (typeof DASHBOARD_MODULES)[number];

export const DEFAULT_MODULE: DashboardModule = "agenda";

/** Middle tabs a household may switch off. The anchors never can. */
export const OPTIONAL_MODULES = ["pets"] as const satisfies readonly DashboardModule[];
export type OptionalModule = (typeof OPTIONAL_MODULES)[number];
export type ModuleFlags = Record<OptionalModule, boolean>;

/**
 * Which optional tabs are on when nothing else is known: every tab. The real
 * value comes from the household's "Who lives here?" answer (Phase 162,
 * migrations/133) through useHouseholdProfile's moduleFlagsFrom; callers
 * that have it pass it in.
 */
export const DEFAULT_MODULE_FLAGS: ModuleFlags = { pets: true };

function isOptional(module: DashboardModule): module is OptionalModule {
  return (OPTIONAL_MODULES as readonly DashboardModule[]).includes(module);
}

/** The tabs to show, in bar order: the anchors plus whichever middles are on. */
export function enabledModules(flags: ModuleFlags = DEFAULT_MODULE_FLAGS): DashboardModule[] {
  return DASHBOARD_MODULES.filter((module) => !isOptional(module) || flags[module]);
}

/**
 * Query-param values from before Phase 100, kept working.
 *
 * These are in live history entries, in the PWA's saved state, and in the
 * "← Owner Dashboard" link on every staff phone. "household" opened on its
 * Chores panel by default, so it still lands on that panel's tab (Home since
 * Phase 175); "staff" was relabelled Access in Phase 96, Household in Phase
 * 155 and Settings in Phase 175, without the param ever changing.
 */
const LEGACY_MODULES: Record<string, DashboardModule> = {
  household: "chores",
  staff: "access",
};

/**
 * The tab a ?module= value opens. A tab that is switched off falls back to the
 * default rather than rendering a screen that has no tab to leave it by.
 */
export function moduleFromParam(
  value: string | null,
  flags: ModuleFlags = DEFAULT_MODULE_FLAGS
): DashboardModule {
  const named = DASHBOARD_MODULES.includes(value as DashboardModule)
    ? (value as DashboardModule)
    : value && LEGACY_MODULES[value];
  return named && enabledModules(flags).includes(named) ? named : DEFAULT_MODULE;
}

export function moduleHref(module: DashboardModule): string {
  // Agenda is the default, so it gets the bare path: the dashboard's own URL
  // should be the screen it opens on, not a redirect to one.
  return module === DEFAULT_MODULE ? "/dashboard" : `/dashboard?module=${module}`;
}

/**
 * Which tab the bar lights for a URL: the module's own, except the room
 * editor opened from Home → Rooms (`?module=access&page=rooms&from=home`),
 * which belongs to Home, where its back link goes (Phase 175 check, P7).
 * The same editor opened from Settings stays under Settings.
 */
export function highlightedTab(
  module: DashboardModule,
  params: { get(name: string): string | null }
): DashboardModule {
  if (module === "access" && params.get("page") === "rooms" && params.get("from") === "home") return "chores";
  return module;
}
