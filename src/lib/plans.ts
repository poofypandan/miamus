import type { Feature } from "@/lib/features";

/**
 * Which features belong to the paid plan, for when billing exists (owner,
 * 2026-11-11). Nothing is gated yet: everything stays free until billing
 * ships, so nothing in the app reads this to hide or lock anything. It is
 * the one list to check when billing arrives; each feature that joins the
 * paid plan is added here as it's built.
 */
export type Plan = "free" | "plus";

export const PLUS_FEATURES: readonly Feature[] = [
  // Kitchen amounts (Phase 170 PR A). Recipes and the menu join here with PR B and PR C.
  "kitchen",
];

export function planFor(feature: Feature): Plan {
  return PLUS_FEATURES.includes(feature) ? "plus" : "free";
}

/** Billing isn't built: every feature is available to every household. */
export const PLANS_ENFORCED = false;
