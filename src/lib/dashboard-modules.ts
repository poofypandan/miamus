/**
 * The owner dashboard's tabs (Phase 100), in bar order (Phase 111).
 *
 * Agenda anchors the left edge and Access the right: Agenda is the screen
 * people open the app for, so it is the first tab and the default, and Access
 * — members, staff, invites, the app lock — is the rarely-visited settings
 * end. They are the two fixed points. Everything between them is the
 * household's own modules, which is where a future "Kids" tab joins and where
 * a household without pets could drop Pets.
 */
export const DASHBOARD_MODULES = ["agenda", "pets", "chores", "inventory", "access"] as const;
export type DashboardModule = (typeof DASHBOARD_MODULES)[number];

export const DEFAULT_MODULE: DashboardModule = "agenda";

/** Middle tabs a household may switch off. The anchors never can. */
export const OPTIONAL_MODULES = ["pets"] as const satisfies readonly DashboardModule[];
export type OptionalModule = (typeof OPTIONAL_MODULES)[number];
export type ModuleFlags = Record<OptionalModule, boolean>;

/**
 * Which optional tabs are on. Hardcoded until there is a household setting to
 * read them from; the bar and the router already go through enabledModules,
 * so that setting only has to replace this value.
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
