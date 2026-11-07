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
  policyVersion: "2026-11-05",
  effectiveDate: { en: "5 November 2026", id: "5 November 2026" },
  /**
   * Where Supabase (database, sign-in, photo storage) runs. The production
   * project is in AWS ap-northeast-1. Update this if the project moves region.
   */
  dataRegion: { en: "Tokyo, Japan", id: "Tokyo, Jepang" },
} as const;

export const isLegalDraft = !LEGAL.operatorName || !LEGAL.contactEmail;
