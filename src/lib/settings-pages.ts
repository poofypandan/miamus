import { moduleHref } from "@/lib/dashboard-modules";

/**
 * The pages of the Settings tab (Phase 155; ?module=access&page=staff), each
 * opened from a row of its list. Here rather than in staff-tab.tsx so that a
 * link to one of them (the guide's places, src/lib/guide.ts) is built from
 * the same list the tab reads, and a test can hold the two together.
 */
export const SETTINGS_PAGES = [
  "family",
  "staff",
  "leave",
  "invite",
  "sign-in",
  "notifications",
  "language",
  "lock",
  "kakak",
  "activity",
  "data",
  "about",
  "whats-new",
  "rooms",
  "features",
  // How Miamus works (Phase 180 H2): the guide, opened from About Miamus.
  "how-miamus-works",
] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

/** The link to one Settings page: /dashboard?module=access&page=staff. */
export function settingsPageHref(page: SettingsPage): string {
  return `${moduleHref("access")}&page=${page}`;
}

/** How Miamus works opened on one entry: …&page=how-miamus-works&entry=today. */
export function guideEntryHref(entryId: string): string {
  return `${settingsPageHref("how-miamus-works")}&entry=${encodeURIComponent(entryId)}`;
}
