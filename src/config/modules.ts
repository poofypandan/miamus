/**
 * Central feature-flag config. Gates UI for modules that aren't built yet
 * so the app can ship Phase 1 (pets) while the schema already supports
 * Phase 2 (household) and Phase 3 (staff).
 */
export const MODULES = {
  pets: true,
  household: false, // Hides cleaning/laundry UI until Phase 2
  staff: false, // Hides attendance UI until Phase 3
} as const;

export type ModuleKey = keyof typeof MODULES;
