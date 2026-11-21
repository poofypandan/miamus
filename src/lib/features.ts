/**
 * Household → Features (Phase 171 PR A, migrations/145): the modules a
 * household can switch off. Only modules that exist have a switch (D4);
 * the always-on core (Today, Chores → Today and Rooms, Shopping, staff) has
 * none, since a switch there would only add a way to break the app.
 *
 * Off hides, never deletes (D6): a switched-off feature's pill, Today
 * lines, staff buttons, Kakak tool and pushes go; its data stays and comes
 * back with the switch. Pets is the fourth row on the Features page but
 * stays households.has_pets (Phase 162, migrations/133), with its own
 * archive-first rule.
 */
import type { HouseholdTask } from "@/types/database";

// "kitchen": kitchen amounts (Phase 170 PR A, migrations/148), the first
// feature that joins off (D4); on for the households that existed when 148
// ran, the founding household among them. Recipes and the menu left it on
// 20 Nov (recipesOn).
export const FEATURES = ["repairs", "bills", "food", "kitchen"] as const;
export type Feature = (typeof FEATURES)[number];
export type FeatureFlags = Record<Feature, boolean>;

/**
 * No row = this. Mirrors household_feature_defaults() (migrations/145, re-created in 148)
 * (a unit test reads the migration and checks they agree). Later features
 * join with `false` (D4: they start off, with an offer at the moment of need).
 */
export const FEATURE_DEFAULTS: FeatureFlags = { repairs: true, bills: true, food: true, kitchen: false };

export function isFeature(value: unknown): value is Feature {
  return typeof value === "string" && (FEATURES as readonly string[]).includes(value);
}

/** household_features rows → flags: a row wins, otherwise the default. */
export function featureFlagsFrom(rows: readonly { feature: string; enabled: boolean }[] | null | undefined): FeatureFlags {
  const flags: FeatureFlags = { ...FEATURE_DEFAULTS };
  for (const row of rows ?? []) {
    if (isFeature(row.feature) && typeof row.enabled === "boolean") flags[row.feature] = row.enabled;
  }
  return flags;
}

/**
 * Bills and upkeep off: its chores (category 'bill') hide everywhere,
 * owners' and staff screens alike. They stay saved, with their payments,
 * and come back with the switch. Upkeep chores (AC service, toren) are
 * ordinary maintenance chores and stay: they're work staff do.
 */
export function visibleChores<T extends Pick<HouseholdTask, "category">>(rows: T[], flags: FeatureFlags): T[] {
  return flags.bills ? rows : rows.filter((row) => row.category !== "bill");
}

/**
 * The Chores pill to show for a ?chores= value: Repairs falls back to
 * Today while it's off, the way moduleFromParam sends a switched-off tab
 * back to Today.
 */
export function choresViewFor<V extends string>(view: V, flags: FeatureFlags): V | "today" {
  return view === "repairs" && !flags.repairs ? "today" : view;
}

/**
 * Kitchen amounts on screen (Phase 170 PR A): the switch alone. Off hides
 * the amounts, Track amount and "How much did you buy?"; the numbers stay
 * saved and come back with the switch, and buying ticks as before.
 */
export function amountsOn(flags: Pick<FeatureFlags, "kitchen">): boolean {
  return flags.kitchen;
}

/**
 * The items as cooking and Add missing to Shopping count them: with Kitchen
 * amounts off, none is tracked, so nothing reads or takes an amount the
 * screens hide (recipes and the menu are on for every home since 20 Nov,
 * so a home with the switch off reaches them too).
 */
export function countedItems<T extends { track_amount?: boolean }>(items: readonly T[], amounts: boolean): readonly T[] {
  return amounts ? items : items.map((item) => (item.track_amount ? { ...item, track_amount: false } : item));
}

/**
 * D6: fresh food and pantry items browse under Food → Ingredients, beside
 * Ready to eat, while kitchen amounts and Food at home are both on;
 * otherwise everything stays under Shopping, as before. Each item lives in
 * one browsing place; To buy still gathers all of it.
 */
export function ingredientsUnderFood(flags: Pick<FeatureFlags, "kitchen" | "food">): boolean {
  return flags.kitchen && flags.food;
}

/**
 * Recipes and the menu (Phase 170 PR B and C) are on for every home since
 * 20 Nov (owner, decision 2 on Can we cook it?): the Menu pill, Menu hari
 * ini and Today's menu line no longer wait for the Kitchen switch, which
 * now holds kitchen amounts only. Kept as a function, with the flags, so
 * every reader stays one place to change.
 */
export function recipesOn(): boolean {
  return true;
}

export type KitchenViewValue = "food" | "buy" | "menu";

/**
 * The Kitchen pill for a ?kitchen= value: with Food at home off there is no
 * Food, and it falls back to the first pill that's there.
 */
export function kitchenViewFor(view: KitchenViewValue, flags: FeatureFlags): KitchenViewValue {
  if (view === "menu" && !recipesOn()) return flags.food ? "food" : "buy";
  return view === "food" && !flags.food ? "buy" : view;
}

/**
 * The Kitchen pills shown, in order: Food · Menu · Shopping. With Food at
 * home off it stays Shopping · Menu, so the pill it opens on stays first.
 * One pill is no pills.
 */
export function kitchenViews(flags: FeatureFlags): KitchenViewValue[] {
  const menu = recipesOn() ? (["menu"] as const) : [];
  return flags.food ? ["food", ...menu, "buy"] : ["buy", ...menu];
}

/** How many of the Features page's rows are on, Pets included: "4 on". */
export function featuresOnCount(flags: FeatureFlags, petsOn: boolean): number {
  return FEATURES.filter((feature) => flags[feature]).length + (petsOn ? 1 : 0);
}
