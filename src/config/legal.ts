/**
 * The facts the privacy policy (/privacy, /privasi) states about who runs
 * Miamus and where its data lives. One place, so a change here is a change on
 * both language versions at once.
 *
 * TODO(owner): fill in operatorName and contactEmail before this reaches
 * production — until both are set, the policy shows a "Draft" banner. Bump
 * policyVersion and effectiveDate whenever the policy's substance changes.
 */
export const LEGAL = {
  /** Who runs Miamus: your name, or your company's registered name. */
  operatorName: "Poofy Labs",
  /** An inbox you actually check. Data requests under UU PDP arrive here. */
  contactEmail: "support@poofylabs.dev",
  // 2026-11-06: requests to set up a household, and their 30-day retention
  // (Phase 148, migrations/113); an admin's language choice (Phase 149,
  // migrations/114).
  // 2026-11-07: the language picked on the sign-in screen, kept on the phone
  // (Phase 150). Staff sign-in attempts (30 days) and the linked-phones list
  // admins see (Phase 151, migrations/115).
  // 2026-11-07.3: food the household lists — where it came from, where it
  // is kept, its expiry (or "don't know"), its photo (kept while listed) —
  // finished food (kept 90 days), and the admins' notification when staff
  // add food (Phase 156, migrations/123).
  // 2026-11-07.4: the admins' morning notification of food that expires
  // today or tomorrow (Phase 157, migrations/124).
  policyVersion: "2026-11-07.4",
  effectiveDate: { en: "7 November 2026", id: "7 November 2026" },
  /**
   * Where Supabase (database, sign-in, photo storage) runs. The production
   * project is in AWS ap-northeast-1. Update this if the project moves region.
   */
  dataRegion: { en: "Tokyo, Japan", id: "Tokyo, Jepang" },
} as const;

export const isLegalDraft = !LEGAL.operatorName || !LEGAL.contactEmail;
