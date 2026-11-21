import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * What the "One day" page still waits for, in one place, so the switch can't
 * be turned on too early (Fable's visual gate, 20 Nov 2026, must 1 and 3).
 *
 * next.config.ts refuses to build with LANDING_ONE_DAY=on while
 * oneDayBlockers() lists anything, and the page draws a marked placeholder
 * exactly where a picture here is still null. So no placeholder can go
 * live: the same value decides both.
 *
 * Plain data, no React: next.config.ts imports it.
 */

/** The three app pictures, re-captured from the live app (both languages). null: a placeholder is drawn. */
export const ONE_DAY_PICTURES: Record<"card" | "staff" | "status", Record<OwnerLocale, string> | null> = {
  card: null,
  staff: null,
  status: null,
};

/**
 * Request access step 1 says "Then one short question, and a person reads
 * your answer." That is true once the why question (PR #157) is live on
 * production. Set to true in the PR that ships it, or after it is live.
 */
export const WHY_QUESTION_LIVE = false;

/**
 * The film at dusk. null: no film yet. Until there is one, the dusk line
 * stands alone, unless the owners want the "Film coming" plate shown
 * (SHOW_FILM_PLATE), which was left as their call (03-decisions.md, 5).
 */
export const ONE_DAY_FILM: { src: string; poster: string } | null = null;
export const SHOW_FILM_PLATE = false;

const LOCALES: OwnerLocale[] = ["en", "id"];

/**
 * The capture for one picture in one language, or null when the page must
 * draw a placeholder. The page and the guard both ask this, so they can't
 * disagree (an empty string counts as missing, as the page treats it).
 */
export function pictureSrc(
  name: keyof typeof ONE_DAY_PICTURES,
  locale: OwnerLocale,
  pictures: typeof ONE_DAY_PICTURES = ONE_DAY_PICTURES
): string | null {
  const src = pictures[name]?.[locale]?.trim();
  return src ? src : null;
}

/** Why the page can't be switched on yet; empty when it can. */
export function oneDayBlockers(
  pictures: typeof ONE_DAY_PICTURES = ONE_DAY_PICTURES,
  whyQuestionLive: boolean = WHY_QUESTION_LIVE
): string[] {
  const blockers: string[] = [];
  for (const name of Object.keys(pictures) as (keyof typeof ONE_DAY_PICTURES)[]) {
    const missing = LOCALES.filter((locale) => !pictureSrc(name, locale, pictures));
    if (missing.length > 0) {
      blockers.push(
        `the app picture "${name}" is still a placeholder in ${missing.join(" and ")} (re-capture it from the live app)`
      );
    }
  }
  if (!whyQuestionLive) {
    blockers.push("the why question (PR #157) isn't live, and Request access promises it (WHY_QUESTION_LIVE)");
  }
  return blockers;
}
