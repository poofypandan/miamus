/**
 * Starter templates (Phase 172 PR A2): the kinds of home the sign-up asks
 * about, and where the answer goes. Phase 171 PR A draws the question
 * ("What kind of home?", after Create household); Phase 172 owns these keys
 * and everything after the answer (docs/phase-172-first-ten-minutes-plan.md,
 * "Where 171 stops and 172 starts").
 *
 * The answer is stored in household_setup.home_type (migrations/142) through
 * record_household_setup(). The keys match that column's check.
 */
export const HOME_TYPES = ["garden", "multi_floor", "apartment", "other"] as const;
export type HomeType = (typeof HOME_TYPES)[number];

export function isHomeType(value: unknown): value is HomeType {
  return typeof value === "string" && (HOME_TYPES as readonly string[]).includes(value);
}

/**
 * Whether sign-up asks "What kind of home?". Off until the template review
 * it opens exists (Phase 172 PR A2): a question that changes nothing is
 * reading for nothing (plan, "Where 171 stops and 172 starts").
 */
export const SETUP_TEMPLATES_READY = false;
