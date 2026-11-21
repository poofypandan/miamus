/**
 * The switch for the "One day" landing page (docs/private/landing, prototype
 * 3, chosen by the owners on 20 Nov 2026). Read at build time: the landing
 * pages are static, so changing it means a redeploy.
 *
 *   LANDING_ONE_DAY unset or "off"  /welcome and /selamat-datang show today's
 *                                    page; the preview routes are 404.
 *   LANDING_ONE_DAY = "preview"      today's page stays at /welcome, and the new
 *                                    one is at /welcome/one-day and
 *                                    /selamat-datang/sehari (noindex), for a
 *                                    look before switching on, and for the
 *                                    browser tests.
 *   LANDING_ONE_DAY = "on"           the new page is served at /welcome
 *                                    and /selamat-datang.
 *
 * Off until the owner switches it on, after the app look PRs 1 to 4
 * (04-app-visual-direction.md, section 7) and once the app pictures are
 * re-captured.
 */
export type OneDayLanding = "off" | "preview" | "on";

export function parseOneDayLanding(value: string | undefined): OneDayLanding {
  const v = value?.trim().toLowerCase();
  return v === "on" || v === "preview" ? v : "off";
}

export function oneDayLanding(): OneDayLanding {
  return parseOneDayLanding(process.env.LANDING_ONE_DAY);
}
