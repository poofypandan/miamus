/**
 * The iPhone launch screens (20 Nov): what an iPhone shows between the tap on
 * the home-screen icon and the app's first frame.
 *
 * Without one an iPhone shows a plain white screen and the mark pops in when
 * the page paints. With one, the icon zooms open into this picture (the same
 * white, the same settled 160pt mark at the very spot the launch stage will
 * draw it) and the hand-over to the page cannot be seen. Android draws its own
 * splash from the manifest instead (see manifest.ts and MiamusMark).
 *
 * iOS picks the image whose media query matches the phone exactly, so there is
 * one per screen size. Portrait only, like the app (manifest orientation).
 *
 * Where the mark goes: with apple-mobile-web-app-status-bar-style "default"
 * (layout.tsx) the page starts below the status bar and runs to the bottom
 * edge (viewport-fit=cover), so the stage's centre, and the mark's, is
 * halfway down what is left: statusBar + (height - statusBar) / 2. The image
 * covers the whole screen, so it draws the mark there too. An error of a few
 * points in a status bar height moves the mark by half of it.
 */

export interface IPhoneScreen {
  /** Route id: CSS width x height, then the pixel ratio ("393x852-3x"). */
  id: string;
  /** CSS points. */
  width: number;
  height: number;
  dpr: 2 | 3;
  /** The status bar's height in points (the top safe area on notched phones). */
  statusBar: number;
  /** Which iPhones, for whoever edits this list. */
  phones: string;
}

/** Current iPhones, newest first. Same-size phones share one entry. */
const SCREENS: Omit<IPhoneScreen, "id">[] = [
  { width: 440, height: 956, dpr: 3, statusBar: 62, phones: "16 Pro Max, 17 Pro Max" },
  { width: 420, height: 912, dpr: 3, statusBar: 62, phones: "Air" },
  { width: 402, height: 874, dpr: 3, statusBar: 62, phones: "16 Pro, 17, 17 Pro" },
  { width: 430, height: 932, dpr: 3, statusBar: 59, phones: "14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus" },
  { width: 393, height: 852, dpr: 3, statusBar: 59, phones: "14 Pro, 15, 15 Pro, 16" },
  { width: 428, height: 926, dpr: 3, statusBar: 47, phones: "12 Pro Max, 13 Pro Max, 14 Plus" },
  { width: 390, height: 844, dpr: 3, statusBar: 47, phones: "12, 12 Pro, 13, 13 Pro, 14, 16e" },
  // The minis have a 50pt bar and the X / XS / 11 Pro 44pt: 47 halves the
  // difference, so either is within 1.5pt.
  { width: 375, height: 812, dpr: 3, statusBar: 47, phones: "X, XS, 11 Pro, 12 mini, 13 mini" },
  { width: 414, height: 896, dpr: 3, statusBar: 44, phones: "XS Max, 11 Pro Max" },
  { width: 414, height: 896, dpr: 2, statusBar: 48, phones: "XR, 11" },
  { width: 375, height: 667, dpr: 2, statusBar: 20, phones: "SE (2nd and 3rd), 8" },
];

export const IPHONE_SCREENS: IPhoneScreen[] = SCREENS.map((s) => ({
  ...s,
  id: `${s.width}x${s.height}-${s.dpr}x`,
}));

/** The <link rel="apple-touch-startup-image"> list for layout.tsx's metadata. */
export function iosStartupImages(): { url: string; media: string }[] {
  return IPHONE_SCREENS.map((s) => ({
    url: `/apple-splash/${s.id}`,
    media:
      `(device-width: ${s.width}px) and (device-height: ${s.height}px)` +
      ` and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)`,
  }));
}

/** Where the mark's centre falls on a screen, in points from the top. */
export function markCentreY(s: Pick<IPhoneScreen, "height" | "statusBar">): number {
  return s.statusBar + (s.height - s.statusBar) / 2;
}
