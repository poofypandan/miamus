/**
 * The launch mark's sizes (21 Nov: measured on the owner's Pixel, then
 * Fable's look).
 *
 * An installed Android app's splash is drawn by Android, not by us: the
 * maskable icon (manifest.ts; Chrome picks a maskable icon first for the
 * splash), cut to a 240dp circle, which is Android 12's splash icon size.
 * The tile inside it is drawn at about 275dp, so the glyph (80% of the tile,
 * BrandMark's maskable scale) is a 220dp box. Measured on the owner's Pixel to
 * the pixel: a 540px circle and a 316px roof at 2.25px per dp, against the
 * old 160px mark (360px). A page's CSS pixel is that same dp. So there the
 * launch mark is that circle and that glyph exactly (globals.css,
 * .mark-opening), and the hand-over from the splash can't be seen.
 *
 * Everywhere else nothing forces a size: iPhones (our own launch screens,
 * app/apple-splash) and browser tabs show the rounded square at 144pt, the
 * glyph filling it as on the app icon. A 220pt square read as the icon blown
 * up to half the screen (Fable). The launch screen and the first frame draw
 * the same number.
 *
 * Its own file, with no "use client", so the server-rendered launch screens
 * share the numbers with the client mark.
 */
export const LAUNCH_MARK_SIZE = 144;

/** Android's splash circle (Android 12+, 240dp). */
export const ANDROID_SPLASH_CIRCLE = 240;

/** The glyph's box inside it (80% of the tile Android draws, 220dp). */
export const ANDROID_SPLASH_GLYPH = 220;
