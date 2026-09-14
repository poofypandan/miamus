/**
 * Central feature-flag config. Gates UI for modules that aren't built yet
 * so the app can ship Phase 1 (pets) while the schema already supports
 * Phase 2 (household) and Phase 3 (staff).
 */
export const MODULES = {
  pets: true,
  household: true, // Master Inventory, Phase 60C
  staff: true, // Operational audit log, Phase 60D
} as const;

export type ModuleKey = keyof typeof MODULES;
