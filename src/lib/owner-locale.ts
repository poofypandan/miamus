/**
 * The language an owner reads Miamus in (Phase 149, migrations/114).
 *
 * Owners choose English or Bahasa Indonesia; staff screens are always Bahasa
 * Indonesia and never read this. The choice lives on the account
 * (user_preferences) and is cached on the phone so the next launch opens in
 * the right language before the network answers.
 */
export type OwnerLocale = "en" | "id";

export const OWNER_LOCALES: readonly OwnerLocale[] = ["en", "id"];

/** What an owner who has not chosen sees: what owner screens always were. */
export const DEFAULT_OWNER_LOCALE: OwnerLocale = "en";

/** Each language named in itself, so the choice reads to whoever needs it. */
export const LOCALE_NAMES: Record<OwnerLocale, string> = {
  en: "English",
  id: "Bahasa Indonesia",
};

/** BCP 47 tags for toLocaleDateString and Intl, per owner language. */
export const DATE_LOCALE: Record<OwnerLocale, string> = {
  en: "en-US",
  id: "id-ID",
};

export function parseOwnerLocale(value: unknown): OwnerLocale | null {
  return value === "en" || value === "id" ? value : null;
}

const STORAGE_KEY = "miamus.owner-locale";

/** The phone's copy of the account's choice. Null if none or unreadable. */
export function readCachedOwnerLocale(): OwnerLocale | null {
  try {
    return parseOwnerLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeCachedOwnerLocale(locale: OwnerLocale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Private mode or storage full: the account still has the choice.
  }
}

/**
 * Forget the phone's copy on sign-out, so the next account to sign in on this
 * phone does not open in the last one's language before its own arrives.
 */
export function clearCachedOwnerLocale(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear, or storage blocked.
  }
}

/**
 * The language for a message raised outside any React language context — a
 * toast from the household data layer, the update prompt (Phase 149). Owner
 * screens (/dashboard, /onboarding) use the owner's choice as cached on this
 * phone; every other screen is a staff screen, and staff read Bahasa
 * Indonesia — an owner in Action Mode included, as on the rest of that view.
 */
export function screenLocale(pathname?: string): OwnerLocale {
  const path = pathname ?? (typeof window === "undefined" ? "" : window.location.pathname);
  const ownerScreen = path.startsWith("/dashboard") || path.startsWith("/onboarding");
  if (!ownerScreen) return "id";
  return (typeof window === "undefined" ? null : readCachedOwnerLocale()) ?? DEFAULT_OWNER_LOCALE;
}
